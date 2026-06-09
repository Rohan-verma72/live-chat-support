import { Router } from "express";
import { SupportAgent } from "../database/models/SupportAgent.js";
import { generateToken, httpAuthMiddleware } from "../middleware/auth.js";
import { authRateLimit } from "../middleware/rateLimit.js";
import { createUniqueId } from "../services/sessionService.js";

const router = Router();


router.post("/register", authRateLimit, async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email, and password are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const existingEmail = await SupportAgent.findOne({ email });
    if (existingEmail) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const existingName = await SupportAgent.findOne({ name });
    if (existingName) {
      return res.status(409).json({ error: "Agent name already taken" });
    }

    const agent = await SupportAgent.create({
      agentId: `agent-${createUniqueId()}`,
      name,
      email,
      password, 
      role: "agent",
      lastSeenAt: Date.now(),
    });

    const token = generateToken(agent);

    res.status(201).json({
      agent: {
        id: agent.agentId,
        name: agent.name,
        email: agent.email,
        role: agent.role,
      },
      token,
    });
  } catch (err) {
    console.error("Registration error:", err.message);
    res.status(500).json({ error: "Registration failed" });
  }
});


router.post("/login", authRateLimit, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const agent = await SupportAgent.findOne({ email });
    if (!agent || !agent.passwordHash) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const isValid = await agent.comparePassword(password);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    agent.lastSeenAt = Date.now();
    await agent.save();

    const token = generateToken(agent);

    res.json({
      agent: {
        id: agent.agentId,
        name: agent.name,
        email: agent.email,
        role: agent.role,
      },
      token,
    });
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ error: "Login failed" });
  }
});


router.get("/me", httpAuthMiddleware, async (req, res) => {
  try {
    const agent = await SupportAgent.findOne({ agentId: req.agent.id });
    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }

    res.json({
      agent: {
        id: agent.agentId,
        name: agent.name,
        email: agent.email,
        role: agent.role,
        createdAt: agent.createdAt,
        lastSeenAt: agent.lastSeenAt,
      },
    });
  } catch (err) {
    console.error("Get agent error:", err.message);
    res.status(500).json({ error: "Failed to fetch agent info" });
  }
});

export default router;
