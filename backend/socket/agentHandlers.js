import { ChatSession } from "../database/models/ChatSession.js";
import {
  activeAgents,
  findOrCreateSupportAgent,
  findActiveAgentById,
  fetchAllSessions,
  buildSessionPayload,
  assignChatToAgent,
  patchSession,
  emitSessionUpdate,
  broadcastAgentList,
  broadcastAgentsAvailability,
} from "../services/sessionService.js";
import { pushSystemMessage } from "../services/messageService.js";
import { verifyToken } from "../middleware/auth.js";
import { SupportAgent } from "../database/models/SupportAgent.js";

export function registerAgentHandlers(socket, io) {
  socket.on("agent:join", async (payload) => {
    let name = payload?.name ? String(payload.name).trim() : "";
    const status = payload?.status || "online";
    const token = payload?.token;

    let dbAgent;
    try {
      if (token) {
        const decoded = verifyToken(token);
        if (!decoded) {
          socket.emit("agent:join-error", { error: "Invalid or expired token" });
          return;
        }
        dbAgent = await SupportAgent.findOne({ agentId: decoded.id });
        if (!dbAgent) {
          socket.emit("agent:join-error", { error: "Agent not found" });
          return;
        }
        dbAgent.lastSeenAt = Date.now();
        await dbAgent.save();
        name = dbAgent.name;
      } else {
        if (!name) {
          socket.emit("agent:join-error", { error: "Name is required" });
          return;
        }
        dbAgent = await findOrCreateSupportAgent(name);
      }

      const agent = {
        id: dbAgent.agentId,
        name: dbAgent.name,
        status: ["online", "away", "busy", "offline"].includes(status) ? status : "online",
        socketId: socket.id,
        activeSessionId: null,
        joinedAt: Date.now(),
      };

      activeAgents.set(socket.id, agent);
      socket.join("agents");
      socket.data.role = "agent";
      socket.data.agentId = agent.id;

      socket.emit("agent:registered", { agent });
      socket.emit("sessions:update", await fetchAllSessions());
      broadcastAgentList(io);
      broadcastAgentsAvailability(io);

      try {
        const activeSessions = await ChatSession.find({
          assignedAgentId: agent.id,
          status: { $ne: "closed" },
        });
        for (const doc of activeSessions) {
          emitSessionUpdate(doc, io);
        }
      } catch (err) {
        console.error("Error updating sessions on agent join:", err.message);
      }
    } catch (err) {
      console.error("agent:join error:", err.message);
      socket.emit("agent:join-error", { error: "❌ Agent login failed — DB error" });
    }
  });

  socket.on("agent:status", async ({ status }) => {
    const agent = activeAgents.get(socket.id);
    if (!agent || !["online", "away", "busy", "offline"].includes(status)) return;
    agent.status = status;
    broadcastAgentList(io);
    broadcastAgentsAvailability(io);
    try {
      const activeSessions = await ChatSession.find({
        assignedAgentId: agent.id,
        status: { $ne: "closed" },
      });
      for (const doc of activeSessions) {
        emitSessionUpdate(doc, io);
      }
    } catch (err) {
      console.error("Error updating sessions on agent status change:", err.message);
    }
  });

  socket.on("agent:open-session", async ({ sessionId }) => {
    const agent = activeAgents.get(socket.id);
    if (!agent || !sessionId) return;

    try {
      const doc = await ChatSession.findOne({ sessionId });
      if (!doc) return;

      await ChatSession.updateOne(
        { sessionId },
        { $set: { "messages.$[elem].seenByAgent": true } },
        { arrayFilters: [{ "elem.from": "visitor" }] }
      );

      agent.activeSessionId = sessionId;

      socket.join(`session:${sessionId}`);
      const latest = await ChatSession.findOne({ sessionId });
      socket.emit("session:history", { sessionId, messages: latest.messages });
      socket.emit("session:update", buildSessionPayload(latest));
      io.to("agents").emit("sessions:update", await fetchAllSessions());
      broadcastAgentList(io);

      socket.to(`session:${sessionId}`).emit("session:seen", { sessionId, role: "agent" });
    } catch (err) {
      console.error("agent:open-session error:", err.message);
    }
  });

  socket.on("agent:claim", async ({ sessionId }) => {
    const agent = activeAgents.get(socket.id);
    if (!agent || !sessionId) return;

    try {
      const doc = await ChatSession.findOne({ sessionId });
      if (!doc || doc.status === "closed") return;
      if (doc.assignedAgentId && doc.assignedAgentId !== agent.id) return;

      await assignChatToAgent(doc, agent, doc.assignedAgentId ? "assigned" : "claimed", io);
      agent.activeSessionId = sessionId;
      socket.join(`session:${sessionId}`);
      broadcastAgentList(io);
    } catch (err) {
      console.error("agent:claim error:", err.message);
    }
  });

  socket.on("agent:assign", async ({ sessionId, targetAgentId }) => {
    const agent = activeAgents.get(socket.id);
    const target = findActiveAgentById(targetAgentId);
    if (!agent || !target || !sessionId) return;

    try {
      const doc = await ChatSession.findOne({ sessionId });
      if (!doc || doc.status === "closed") return;

      io.sockets.sockets.get(target.socketId)?.join(`session:${sessionId}`);
      const latest = await assignChatToAgent(doc, target, doc.assignedAgentId ? "transferred" : "assigned", io);
      target.activeSessionId = sessionId;

      const sessionPayload = buildSessionPayload(latest);
      io.to(target.socketId).emit("chat:assigned-to", {
        sessionId,
        fromAgentName: agent.name,
        session: sessionPayload,
        messages: latest.messages,
      });

      if (agent.id !== target.id) {
        io.to(socket.id).emit("chat:transferred-away", {
          sessionId,
          newAgentName: target.name,
          session: sessionPayload,
        });
      }

      broadcastAgentList(io);
    } catch (err) {
      console.error("agent:assign error:", err.message);
      socket.emit("transfer:error", { error: "❌ Assign failed — DB error, retry" });
    }
  });

  socket.on("agent:transfer", async ({ sessionId, targetAgentId }) => {
    const agent = activeAgents.get(socket.id);
    const target = findActiveAgentById(targetAgentId);
    if (!agent || !target || !sessionId) return;

    if (agent.id === target.id) {
      socket.emit("transfer:error", { error: "Cannot transfer to yourself" });
      return;
    }

    try {
      const doc = await ChatSession.findOne({ sessionId });
      if (!doc || doc.status === "closed") return;

      const sourceSocketId = socket.id;

      io.sockets.sockets.get(target.socketId)?.join(`session:${sessionId}`);

      if (agent.activeSessionId === sessionId) {
        agent.activeSessionId = null;
      }

      await assignChatToAgent(doc, target, "transferred", io);
      target.activeSessionId = sessionId;

      const latest = await ChatSession.findOne({ sessionId });
      const sessionPayload = buildSessionPayload(latest);

      io.to(sourceSocketId).emit("chat:transferred-away", {
        sessionId,
        newAgentName: target.name,
        session: sessionPayload,
      });

      io.to(target.socketId).emit("chat:transferred-to", {
        sessionId,
        fromAgentName: agent.name,
        session: sessionPayload,
        messages: latest.messages,
      });

      broadcastAgentList(io);
    } catch (err) {
      console.error("agent:transfer error:", err.message);
      socket.emit("transfer:error", { error: "❌ Transfer failed — DB error, retry" });
    }
  });

  socket.on("agent:close-session", async ({ sessionId }) => {
    const agent = activeAgents.get(socket.id);
    if (!agent || !sessionId) return;

    try {
      const doc = await patchSession(sessionId, {
        status: "closed",
        closedAt: Date.now(),
        closedBy: agent.name,
        expireAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
      if (!doc) return;

      await pushSystemMessage(sessionId, `Chat closed by ${agent.name}`, io);
      if (agent.activeSessionId === sessionId) agent.activeSessionId = null;
      emitSessionUpdate(doc, io);
      io.to("agents").emit("sessions:update", await fetchAllSessions());
      broadcastAgentList(io);
    } catch (err) {
      console.error("agent:close-session error:", err.message);
    }
  });

  socket.on("agent:reopen-session", async ({ sessionId }) => {
    const agent = activeAgents.get(socket.id);
    if (!agent || !sessionId) return;

    try {
      let doc = await ChatSession.findOneAndUpdate(
        { sessionId },
        {
          $set: { status: "active", closedAt: null, closedBy: null, updatedAt: Date.now() },
          $unset: { expireAt: "" }
        },
        { new: true }
      );
      if (!doc) return;

      if (!doc.assignedAgentId) await assignChatToAgent(doc, agent, "assigned", io);
      await pushSystemMessage(sessionId, `Chat reopened by ${agent.name}`, io);
      doc = await ChatSession.findOne({ sessionId });
      emitSessionUpdate(doc, io);
      io.to("agents").emit("sessions:update", await fetchAllSessions());
    } catch (err) {
      console.error("agent:reopen-session error:", err.message);
    }
  });

  socket.on("agent:save-notes", async ({ sessionId, notes }) => {
    if (!sessionId) return;
    try {
      const doc = await patchSession(sessionId, { notes });
      if (doc) {
        emitSessionUpdate(doc, io);
        io.to("agents").emit("sessions:update", await fetchAllSessions());
      }
    } catch (err) {
      console.error("agent:save-notes error:", err.message);
    }
  });
}
