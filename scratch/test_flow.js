import "dotenv/config";
import mongoose from "mongoose";
import { connectDatabase } from "../backend/database/connection.js";
import { ChatSession } from "../backend/database/models/ChatSession.js";
import { findOrCreateChatSession, transferToHuman, isWithinHumanHours } from "../backend/services/sessionService.js";
import { generateAIResponse } from "../backend/services/geminiService.js";

async function test() {
  console.log("Connecting to Database...");
  await connectDatabase();

  const testSessionId = `test-session-${Date.now()}`;
  console.log(`Creating test session: ${testSessionId}`);

  const visitor = { name: "Test User", userId: "test-user-id" };
  const doc = await findOrCreateChatSession(testSessionId, visitor, "Test Subject");

  console.log("Created Session Details:");
  console.log("Handling Mode:", doc.handlingMode);
  console.log("Status:", doc.status);

  console.log("\nTesting isWithinHumanHours...");
  const inHours = isWithinHumanHours();
  console.log("Is within support hours:", inHours);

  console.log("\nCalling Gemini API with test message...");
  try {
    const reply = await generateAIResponse(doc, "Hello, can you help me with billing?");
    console.log("Gemini Reply:", reply);
  } catch (err) {
    console.error("Gemini API Error:", err);
  }

  console.log("\nTesting transferToHuman...");
  const mockIo = {
    to: () => ({
      emit: (event, data) => {
        console.log(`[Socket IO Emit] Event: ${event}`, JSON.stringify(data, null, 2));
      }
    })
  };
  
  const updatedDoc = await transferToHuman(testSessionId, mockIo);
  console.log("\nUpdated Session Details after transfer:");
  console.log("Handling Mode:", updatedDoc.handlingMode);
  console.log("Status:", updatedDoc.status);
  console.log("Assigned Agent Name:", updatedDoc.assignedAgentName);

  // Clean up
  await ChatSession.deleteOne({ sessionId: testSessionId });
  console.log("\nTest session deleted. Disconnecting...");
  await mongoose.disconnect();
  console.log("Disconnected successfully.");
}

test().catch(console.error);
