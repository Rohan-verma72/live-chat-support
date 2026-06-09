import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    id: String,
    createdAt: Number,
    from: String,
    type: { type: String, default: "text" },
    body: String,
    image: String,
    filename: String,
    agentId: String,
    agentName: String,
    seenByAgent: { type: Boolean, default: false },
    seenByVisitor: { type: Boolean, default: false },
    replyTo: {
      id: String,
      body: String,
      from: String,
      type: { type: String }
    }
  },
  { _id: false }
);

const previousAgentSchema = new mongoose.Schema(
  {
    agentId: String,
    agentName: String,
    assignedAt: Number,
    unassignedAt: Number,
    reason: String
  },
  { _id: false }
);

const chatSessionSchema = new mongoose.Schema({
  sessionId: { type: String, unique: true, index: true },
  ticketNumber: { type: String, unique: true }, // Sequential ticket number (#TCK-1001)
  subject: { type: String, default: "General Support" },
  visitor: {
    name: String,
    userId: String,
    page: String,
    userAgent: String
  },
  status: { type: String, default: "waiting" },
  handlingMode: { type: String, enum: ["ai", "human"], default: "ai" },
  assignedAgentId: String,
  assignedAgentName: String,
  assignedAt: Number,
  closedAt: Number,
  closedBy: String,
  previousAgents: [previousAgentSchema],
  messages: [messageSchema],
  notes: { type: String, default: "" },
  expireAt: { type: Date, index: { expires: 0 } },
  createdAt: { type: Number, default: () => Date.now() },
  updatedAt: { type: Number, default: () => Date.now() }
});

export const ChatSession = mongoose.model("Session", chatSessionSchema);
