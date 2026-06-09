import { ChatSession } from "../database/models/ChatSession.js";
import { createUniqueId, fetchAllSessions } from "./sessionService.js";

export async function appendMessage(sessionId, message) {
  const saved = { id: createUniqueId(), createdAt: Date.now(), ...message };
  await ChatSession.findOneAndUpdate(
    { sessionId },
    { $push: { messages: saved }, $set: { updatedAt: saved.createdAt } }
  );
  return saved;
}

export async function pushSystemMessage(sessionId, body, io) {
  const saved = await appendMessage(sessionId, { from: "system", type: "system", body });
  io.to(`session:${sessionId}`).emit("message:new", { sessionId, message: saved });
  return saved;
}

export async function pushChatMessage(sessionId, message, io) {
  const doc = await ChatSession.findOne({ sessionId });
  if (!doc) return null;

  if (message.from === "visitor" && doc.status === "closed") {
    return null;
  }

  const saved = await appendMessage(sessionId, message);
  io.to(`session:${sessionId}`).emit("message:new", { sessionId, message: saved });
  io.to("agents").emit("sessions:update", await fetchAllSessions());
  return saved;
}
