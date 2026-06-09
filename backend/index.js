import "dotenv/config";
import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { Server } from "socket.io";


import { connectDatabase, disconnectDatabase } from "./database/connection.js";


import { socketAuthMiddleware } from "./middleware/auth.js";
import { rateLimit } from "./middleware/rateLimit.js";


import healthRouter from "./routes/health.js";
import authRouter from "./routes/auth.js";

import { registerAgentHandlers } from "./socket/agentHandlers.js";
import { registerVisitorHandlers } from "./socket/visitorHandlers.js";
import { registerMessageHandlers } from "./socket/messageHandlers.js";

import { ChatSession } from "./database/models/ChatSession.js";
import {
  activeAgents,
  visitorOnline,
  fetchAllSessions,
  emitSessionUpdate,
  broadcastAgentList,
  broadcastAgentsAvailability,
} from "./services/sessionService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, "..");
const distPath = path.join(ROOT_DIR, "dist");
const widgetPath = path.join(ROOT_DIR, "widget", "support-widget.js");

const app = express();
const server = http.createServer(app);

const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.use(express.json({ limit: "8mb" }));
app.use(express.static(distPath));
app.use("/widget", express.static(path.join(ROOT_DIR, "widget")));

app.use("/api/", rateLimit({ windowMs: 60_000, max: 100 }));

app.use("/", healthRouter);
app.use("/api/auth", authRouter);

app.get("/embed.js", (_req, res) => res.sendFile(widgetPath));
app.get("/widget/support-widget.js", (_req, res) => res.sendFile(widgetPath));

app.get("/{*splat}", (_req, res) => {
  const indexPath = path.join(distPath, "index.html");
  res.sendFile(indexPath, (err) => {
    if (err) res.status(404).json({ error: "Build not found. Run: npm run build" });
  });
});


const io = new Server(server, {
  cors: { origin: CORS_ORIGIN },
  maxHttpBufferSize: 8 * 1024 * 1024,
});


io.use(socketAuthMiddleware);

io.on("connection", (socket) => {
  registerAgentHandlers(socket, io);
  registerVisitorHandlers(socket, io);
  registerMessageHandlers(socket, io);


  socket.on("disconnect", async () => {
    const agent = activeAgents.get(socket.id);
    if (agent) {
      activeAgents.delete(socket.id);
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
        console.error("Error updating sessions on agent disconnect:", err.message);
      }
    }

    if (socket.data.role === "visitor" && socket.data.sessionId) {
      const sessionId = socket.data.sessionId;
      visitorOnline.set(sessionId, false);
      try {
        const doc = await ChatSession.findOne({ sessionId });
        if (doc) {
          emitSessionUpdate(doc, io);
          io.to("agents").emit("sessions:update", await fetchAllSessions());
        }
      } catch (err) {
        console.error("disconnect error:", err.message);
      }
    }
  });
});


const PORT = process.env.PORT || 3000;

connectDatabase()
  .then(async () => {
    try {
      const result = await ChatSession.updateMany(
        { assignedAgentId: { $exists: true, $ne: null }, handlingMode: { $ne: "human" } },
        { $set: { handlingMode: "human" } }
      );
      if (result.modifiedCount > 0) {
        console.log(`   Migration -> Updated ${result.modifiedCount} existing claimed sessions to human handling mode`);
      }
    } catch (err) {
      console.error("   Migration error:", err.message);
    }

    server.listen(PORT, () => {
      console.log("\nLive Chat Support System");
      console.log(`   Server     -> http://localhost:${PORT}`);
      console.log(`   Dashboard  -> http://localhost:5173/agent`);
      console.log(`   Widget     -> http://localhost:${PORT}/widget/support-widget.js\n`);
    });
  })
  .catch((err) => {
    console.error(`\n❌ MongoDB connection failed — ${err.message}`);
    console.error("   Fix: Check MONGODB_URI in .env then run: npm run server\n");
    process.exit(1);
  });


  function gracefulShutdown(signal) {
  console.log(`\n${signal} received. Shutting down gracefully...`);


  server.close(async () => {
    console.log("   HTTP server closed");
    try {

      io.close();
      console.log("   Socket.IO closed");
    } catch {
      // ignore
    }

    await disconnectDatabase();
    console.log("   Shutdown complete");
    process.exit(0);
  });


  setTimeout(() => {
    console.error("   Forced shutdown after timeout");
    process.exit(1);
  }, 10_000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
