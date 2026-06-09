import { ChatSession } from "../database/models/ChatSession.js";
import {
  activeAgents,
  canAgentReply,
  assignChatToAgent,
  fetchAllSessions,
  transferToHuman,
  ensureAgentOnline,
} from "../services/sessionService.js";
import { pushChatMessage } from "../services/messageService.js";
import { generateAIResponse } from "../services/geminiService.js";

async function autoAssignIfNeeded(doc, agent, io) {
  if (!doc.assignedAgentId && agent.status !== "offline") {
    await assignChatToAgent(doc, agent, "claimed", io);
    return true;
  }
  return false;
}

export function registerMessageHandlers(socket, io) {
  socket.on("typing:status", async ({ sessionId, isTyping, from }) => {
    console.log(`[typing:status] session=${sessionId} isTyping=${isTyping} from=${from}`);
    if (!sessionId) return;

    if (from === "agent" && isTyping) {
      const agent = activeAgents.get(socket.id);
      if (agent) {
        await ensureAgentOnline(agent, io);
      }
    }

    socket.to(`session:${sessionId}`).emit("typing:status", { sessionId, isTyping, from });
  });

  socket.on("session:seen", async ({ sessionId, role }) => {
    if (!sessionId || !role) return;
    try {
      if (role === "agent") {
        await ChatSession.updateOne(
          { sessionId },
          { $set: { "messages.$[elem].seenByAgent": true } },
          { arrayFilters: [{ "elem.from": "visitor" }] }
        );
      } else if (role === "visitor") {
        await ChatSession.updateOne(
          { sessionId },
          { $set: { "messages.$[elem].seenByVisitor": true } },
          { arrayFilters: [{ "elem.from": "agent" }] }
        );
      }

      socket.to(`session:${sessionId}`).emit("session:seen", { sessionId, role });
      io.to("agents").emit("sessions:update", await fetchAllSessions());
    } catch (err) {
      console.error("session:seen error:", err.message);
    }
  });

  socket.on("message:send", async ({ sessionId, message }) => {
    if (!sessionId || !message?.body) return;

    const isAgent = message.from === "agent";
    const agent = activeAgents.get(socket.id);

    try {
      const doc = await ChatSession.findOne({ sessionId });
      if (!doc) return;
      if (isAgent && doc.status === "closed") return;
      if (isAgent && agent) {
        if (!canAgentReply(doc, agent)) {
          socket.emit("message:error", { error: "This chat is assigned to another agent" });
          return;
        }
        await autoAssignIfNeeded(doc, agent, io);
        await ensureAgentOnline(agent, io);
      }

      await pushChatMessage(
        sessionId,
        {
          from: isAgent ? "agent" : "visitor",
          type: "text",
          body: String(message.body).slice(0, 2000),
          agentId: isAgent && agent ? agent.id : undefined,
          agentName: isAgent && agent ? agent.name : undefined,
          replyTo: message.replyTo || undefined
        },
        io
      );

      // AI Mode processing for visitor messages
      if (!isAgent && doc.handlingMode !== "human") {
        const lowerBody = String(message.body).toLowerCase().trim();
        const humanKeywords = [
          "human", "agent", "insan", "person", "staff", "representative", "specialist", "support executive",
          "baat karao", "baat karni", "connect", "transfer", "customer care", "customer support"
        ];
        const wantsHuman = humanKeywords.some(keyword => lowerBody.includes(keyword));

        if (wantsHuman) {
          await transferToHuman(sessionId, io);
        } else {
          // Trigger AI typing
          io.to(`session:${sessionId}`).emit("typing:status", { sessionId, isTyping: true, from: "agent" });

          // Generate AI response
          const latestSession = await ChatSession.findOne({ sessionId });
          const aiResponse = await generateAIResponse(latestSession, message.body);

          // Stop AI typing
          io.to(`session:${sessionId}`).emit("typing:status", { sessionId, isTyping: false, from: "agent" });

          if (aiResponse.includes("[TRANSFER_TO_HUMAN]")) {
            const cleanReply = aiResponse.replace(/\[TRANSFER_TO_HUMAN\]/g, "").trim();
            if (cleanReply) {
              await pushChatMessage(
                sessionId,
                {
                  from: "agent",
                  type: "text",
                  body: cleanReply,
                  agentId: "ai-agent",
                  agentName: "AI Assistant",
                },
                io
              );
            }
            await transferToHuman(sessionId, io);
          } else {
            await pushChatMessage(
              sessionId,
              {
                from: "agent",
                type: "text",
                body: aiResponse,
                agentId: "ai-agent",
                agentName: "AI Assistant",
              },
              io
            );
          }
        }
      }
    } catch (err) {
      console.error("message:send error:", err.message);
    }
  });

  socket.on("screenshot:send", async ({ sessionId, image, filename, from, replyTo }) => {
    if (!sessionId || !image?.startsWith("data:image/")) return;

    const isAgent = from === "agent";
    const agent = activeAgents.get(socket.id);

    try {
      const doc = await ChatSession.findOne({ sessionId });
      if (!doc) return;
      if (isAgent && doc.status === "closed") return;
      if (isAgent && agent) {
        if (!canAgentReply(doc, agent)) {
          socket.emit("message:error", { error: "This chat is assigned to another agent" });
          return;
        }
        await autoAssignIfNeeded(doc, agent, io);
        await ensureAgentOnline(agent, io);
      }

      await pushChatMessage(
        sessionId,
        {
          from: isAgent ? "agent" : "visitor",
          type: "screenshot",
          body: "Screenshot attached",
          filename: filename || "screenshot.png",
          image,
          agentId: isAgent && agent ? agent.id : undefined,
          agentName: isAgent && agent ? agent.name : undefined,
          replyTo: replyTo || undefined
        },
        io
      );
    } catch (err) {
      console.error("screenshot:send error:", err.message);
    }
  });
}
