import { Router } from "express";
import { ChatSession } from "../database/models/ChatSession.js";
import { getActiveAgentList } from "../services/sessionService.js";

const router = Router();

router.get("/health", async (_req, res) => {
  try {
    const count = await ChatSession.countDocuments();
    res.json({
      ok: true,
      sessions: count,
      agents: getActiveAgentList().length,
      onlineAgents: getActiveAgentList().filter((a) => a.status === "online").length,
      database: "mongodb",
    });
  } catch (err) {
    res.status(503).json({
      ok: false,
      error: "Database health check failed",
      message: err.message,
    });
  }
});

export default router;
