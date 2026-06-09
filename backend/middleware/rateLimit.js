/**
 * Simple in-memory rate limiter
 * @param {Object} options
 * @param {number} options.windowMs - Time window in milliseconds (default: 60000 = 1 minute)
 * @param {number} options.max - Max requests per window (default: 60)
 * @param {string} options.message - Error message when rate limited
 */
export function rateLimit({ windowMs = 60_000, max = 60, message = "Too many requests, please try again later." } = {}) {
  const hits = new Map();

  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (now - entry.resetTime >= windowMs) {
        hits.delete(key);
      }
    }
  }, windowMs);

  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  return (req, res, next) => {
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();

    let entry = hits.get(key);
    if (!entry || now - entry.resetTime >= windowMs) {
      entry = { count: 0, resetTime: now };
      hits.set(key, entry);
    }

    entry.count++;

    res.setHeader("X-RateLimit-Limit", max);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, max - entry.count));
    res.setHeader("X-RateLimit-Reset", Math.ceil((entry.resetTime + windowMs) / 1000));

    if (entry.count > max) {
      return res.status(429).json({ error: message });
    }

    next();
  };
}


export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: "Too many authentication attempts, please try again later.",
});
