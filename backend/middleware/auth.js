import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const JWT_SECRET = process.env.JWT_SECRET || "live-chat-default-secret-change-me";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
const SALT_ROUNDS = 10;


export function generateToken(agent) {
  return jwt.sign(
    {
      id: agent.agentId,
      name: agent.name,
      email: agent.email,
      role: agent.role || "agent",
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}


export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}


export async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}


export async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}


export function httpAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const token = authHeader.slice(7);
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  req.agent = decoded;
  next();
}


export function socketAuthMiddleware(socket, next) {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  if (token) {
    const decoded = verifyToken(token);
    if (decoded) {
      socket.data.agentAuth = decoded;
    }
  }
  next();
}
