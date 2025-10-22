import { redis } from '../services/redis.service.js';

export const rateLimiter = async (req, res, next) => {
  const ip = req.ip;
  const key = `rate:${ip}`;

  try {
    const requests = await redis.incr(key);
    if (requests === 1) await redis.expire(key, 300); // 1 min window
    if (requests > 5) return res.status(429).json({ message: 'Too many requests, try again later.' });
    next();
  } catch (err) {
    next(err);
  }
};