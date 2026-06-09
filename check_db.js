import "dotenv/config";
import mongoose from "mongoose";
import { connectDatabase } from "./backend/database/connection.js";
import { ChatSession } from "./backend/database/models/ChatSession.js";
import { SupportAgent } from "./backend/database/models/SupportAgent.js";

async function run() {
  await connectDatabase();
  
  const agents = await SupportAgent.find().lean();
  console.log("=== AGENTS IN DB ===");
  console.log(JSON.stringify(agents, null, 2));

  const sessions = await ChatSession.find().lean();
  console.log("\n=== SESSIONS IN DB ===");
  console.log(JSON.stringify(sessions.map(s => ({
    sessionId: s.sessionId,
    visitor: s.visitor,
    status: s.status,
    assignedAgentId: s.assignedAgentId,
    assignedAgentName: s.assignedAgentName
  })), null, 2));

  await mongoose.disconnect();
}

run().catch(console.error);
