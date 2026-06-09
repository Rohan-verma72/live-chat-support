import { ChatSession } from "../database/models/ChatSession.js";
import {
  visitorOnline,
  createUniqueId,
  findOrCreateChatSession,
  buildSessionPayload,
  getActiveAgentList,
  fetchAllSessions,
  transferToHuman,
} from "../services/sessionService.js";

export function registerVisitorHandlers(socket, io) {
  socket.on("visitor:list-sessions", async ({ userId }) => {
    if (!userId) return;
    try {
      const docs = await ChatSession.find({ "visitor.userId": userId }).sort({ updatedAt: -1 }).lean();
      socket.emit("visitor:sessions-list", docs.map(buildSessionPayload));
    } catch (err) {
      console.error("visitor:list-sessions error:", err.message);
    }
  });

  socket.on("visitor:create-session", async ({ userId, name, subject, page }) => {
    if (!userId) return;
    try {
      const sessionId = `ticket-${createUniqueId()}`;
      const visitor = { name: name || "Customer", userId, page };
      const doc = await findOrCreateChatSession(sessionId, visitor, subject);

      const payload = buildSessionPayload(doc);
      socket.emit("visitor:session-created", payload);

      const docs = await ChatSession.find({ "visitor.userId": userId }).sort({ updatedAt: -1 }).lean();
      socket.emit("visitor:sessions-list", docs.map(buildSessionPayload));

      io.to("agents").emit("sessions:update", await fetchAllSessions());
    } catch (err) {
      console.error("visitor:create-session error:", err.message);
    }
  });

  socket.on("visitor:join", async ({ sessionId, visitor }) => {
    if (!sessionId) return;
    try {
      const doc = await findOrCreateChatSession(sessionId, visitor);
      visitorOnline.set(sessionId, true);
      socket.join(`session:${sessionId}`);
      socket.data.role = "visitor";
      socket.data.sessionId = sessionId;

      socket.emit("session:history", { sessionId, messages: doc.messages });
      socket.emit("session:update", buildSessionPayload(doc));
      socket.emit("agents:availability", {
        online: getActiveAgentList().filter((a) => a.status === "online").length,
        total: getActiveAgentList().length,
      });
      io.to("agents").emit("sessions:update", await fetchAllSessions());
    } catch (err) {
      console.error("visitor:join error:", err.message);
    }
  });

  socket.on("visitor:request-human", async ({ sessionId }) => {
    if (!sessionId) return;
    try {
      await transferToHuman(sessionId, io);
    } catch (err) {
      console.error("visitor:request-human error:", err.message);
    }
  });
}
