import { ChatSession } from "../database/models/ChatSession.js";
import { SupportAgent } from "../database/models/SupportAgent.js";


export const activeAgents = new Map();
export const visitorOnline = new Map();

export function createUniqueId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getActiveAgentList() {
  const uniqueAgents = new Map();
  for (const agent of activeAgents.values()) {
    const existing = uniqueAgents.get(agent.id);
    if (!existing || agent.joinedAt > existing.joinedAt) {
      let status = agent.status;
      if (existing && existing.status === 'online') {
        status = 'online';
      }
      uniqueAgents.set(agent.id, {
        id: agent.id,
        name: agent.name,
        status: status,
        activeSessionId: agent.activeSessionId || existing?.activeSessionId || null,
        joinedAt: agent.joinedAt,
      });
    } else if (existing) {
      if (agent.status === 'online') {
        existing.status = 'online';
      }
    }
  }
  return Array.from(uniqueAgents.values());
}

export function findActiveAgentById(agentId) {
  for (const agent of activeAgents.values()) {
    if (agent.id === agentId) return agent;
  }
  return null;
}

export function buildSessionPayload(doc) {
  const sessionId = doc.sessionId;
  let agentStatus = "offline";
  if (doc.assignedAgentId) {
    const activeAgent = findActiveAgentById(doc.assignedAgentId);
    if (activeAgent) {
      agentStatus = activeAgent.status;
    }
  }
  return {
    id: sessionId,
    ticketNumber: doc.ticketNumber || `#TCK-${sessionId.slice(-5)}`,
    subject: doc.subject || "General Support",
    visitor: doc.visitor,
    status: doc.status,
    handlingMode: doc.handlingMode || "ai",
    assignedAgentId: doc.assignedAgentId,
    assignedAgentName: doc.assignedAgentName,
    assignedAgentStatus: agentStatus,
    assignedAt: doc.assignedAt,
    closedAt: doc.closedAt,
    closedBy: doc.closedBy,
    visitorOnline: visitorOnline.get(sessionId) || false,
    previousAgents: doc.previousAgents || [],
    notes: doc.notes || "",
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    lastMessage: doc.messages?.at(-1) || null,
    unread: (doc.messages || []).filter((m) => m.from === "visitor" && !m.seenByAgent).length,
  };
}

export async function fetchAllSessions() {
  const docs = await ChatSession.find().sort({ updatedAt: -1 }).lean();
  return docs.map(buildSessionPayload);
}

export async function findOrCreateSupportAgent(name) {
  let doc = await SupportAgent.findOne({ name });
  if (!doc) {
    doc = await SupportAgent.create({
      agentId: `agent-${createUniqueId()}`,
      name,
      lastSeenAt: Date.now(),
    });
  } else {
    doc.lastSeenAt = Date.now();
    await doc.save();
  }
  return doc;
}

export async function findOrCreateChatSession(sessionId, visitor, subject) {
  let doc = await ChatSession.findOne({ sessionId });
  if (!doc) {
    const welcomeMessage = {
      id: `system-${createUniqueId()}`,
      createdAt: Date.now(),
      from: "system",
      type: "system",
      body: "Welcome! How can we help you today?",
    };
    const count = await ChatSession.countDocuments();
    const ticketNumber = `#TCK-${1000 + count + 1}`;
    doc = await ChatSession.create({
      sessionId,
      ticketNumber,
      subject: subject || "General Support",
      visitor: visitor || {},
      status: "waiting",
      handlingMode: "ai",
      previousAgents: [],
      messages: [welcomeMessage],
      notes: "",
    });
  } else if (visitor) {
    doc.visitor = { ...(doc.visitor?.toObject?.() || doc.visitor || {}), ...visitor };
    if (subject) doc.subject = subject;
    doc.updatedAt = Date.now();
    await doc.save();
  }
  return doc;
}

export async function patchSession(sessionId, updates) {
  return ChatSession.findOneAndUpdate(
    { sessionId },
    { $set: { ...updates, updatedAt: Date.now() } },
    { new: true }
  );
}

export async function assignChatToAgent(doc, agent, reason, io) {
  const updates = {
    assignedAgentId: agent.id,
    assignedAgentName: agent.name,
    assignedAt: Date.now(),
    handlingMode: "human",
  };

  if (doc.assignedAgentId && doc.assignedAgentId !== agent.id) {
    await ChatSession.findOneAndUpdate(
      { sessionId: doc.sessionId },
      {
        $push: {
          previousAgents: {
            agentId: doc.assignedAgentId,
            agentName: doc.assignedAgentName,
            assignedAt: doc.assignedAt,
            unassignedAt: Date.now(),
            reason: "transferred",
          },
        },
      }
    );
  }

  if (doc.status === "waiting") updates.status = "active";

  const updated = await patchSession(doc.sessionId, updates);
  Object.assign(doc, updated.toObject());

  const body =
    reason === "claimed"
      ? `${agent.name} joined the conversation`
      : reason === "transferred"
        ? `Chat transferred to ${agent.name}`
        : `${agent.name} is now handling your chat`;

  const { pushSystemMessage } = await import("./messageService.js");
  await pushSystemMessage(doc.sessionId, body, io);

  const latest = await ChatSession.findOne({ sessionId: doc.sessionId });
  emitSessionUpdate(latest, io);
  io.to("agents").emit("sessions:update", await fetchAllSessions());
  return latest;
}

export function emitSessionUpdate(doc, io) {
  io.to(`session:${doc.sessionId}`).emit("session:update", buildSessionPayload(doc));
}

export function canAgentReply(doc, agent) {
  if (!agent) return false;
  if (!doc.assignedAgentId) return true;
  return doc.assignedAgentId === agent.id;
}

export function broadcastAgentList(io) {
  io.to("agents").emit("agents:update", getActiveAgentList());
}

export function broadcastAgentsAvailability(io) {
  io.emit("agents:availability", {
    online: getActiveAgentList().filter((a) => a.status === "online").length,
    total: getActiveAgentList().length,
  });
}

export function isWithinHumanHours() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  const parts = formatter.formatToParts(now);
  const hourPart = parts.find(p => p.type === 'hour');
  const minutePart = parts.find(p => p.type === 'minute');
  if (!hourPart || !minutePart) return false;
  const hour = parseInt(hourPart.value, 10);
  const minute = parseInt(minutePart.value, 10);
  const currentTimeInMinutes = hour * 60 + minute;
  const startMinutes = 10 * 60 + 30; // 10:30
  const endMinutes = 18 * 60 + 30;   // 18:30 (6:30 PM)
  return currentTimeInMinutes >= startMinutes && currentTimeInMinutes <= endMinutes;
}

export async function transferToHuman(sessionId, io) {
  try {
    const doc = await ChatSession.findOne({ sessionId });
    if (!doc) return null;

    if (doc.handlingMode === "human") {
      return doc; // Already in human mode
    }

    if (isWithinHumanHours()) {
      const updated = await ChatSession.findOneAndUpdate(
        { sessionId },
        {
          $set: {
            handlingMode: "human",
            status: "waiting", // Goes to human agent unassigned queue
            assignedAgentId: null,
            assignedAgentName: null,
            updatedAt: Date.now()
          }
        },
        { new: true }
      );

      const { pushSystemMessage } = await import("./messageService.js");
      await pushSystemMessage(sessionId, "Chat transferred to a human agent. An agent will join shortly.", io);
      
      emitSessionUpdate(updated, io);
      io.to("agents").emit("sessions:update", await fetchAllSessions());
      return updated;
    } else {
      // Outside of support hours
      const { pushSystemMessage } = await import("./messageService.js");
      await pushSystemMessage(sessionId, "Our support agents are available only between 10:30 AM and 6:30 PM (IST). You can continue chatting with our AI assistant or try again later.", io);
      return doc;
    }
  } catch (err) {
    console.error("transferToHuman error:", err.message);
    return null;
  }
}

export async function ensureAgentOnline(agent, io) {
  if (!agent || agent.status === "online") return;

  agent.status = "online";
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
    console.error("Error updating sessions in ensureAgentOnline:", err.message);
  }
}
