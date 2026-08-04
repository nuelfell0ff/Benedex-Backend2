import { createClient } from "redis";

const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
});

redisClient.on("error", (err) => console.error("Redis Client Error", err));
await redisClient.connect();

export const cacheRedisRoute = (duration = 300) => {
  return async (req, res, next) => {
    if (req.method !== "GET") {
      return next();
    }

    const userId = req.user ? req.user._id || req.user.id : "public";
    const cacheKey = `cache:${req.originalUrl}:${userId}`;

    try {
      const cachedData = await redisClient.get(cacheKey);
      if (cachedData) {
        return res.json(JSON.parse(cachedData));
      }

      const originalJson = res.json;
      res.json = function (body) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          redisClient.setEx(cacheKey, duration, JSON.stringify(body));
        }
        return originalJson.call(this, body);
      };

      next();
    } catch (err) {
      console.error("Redis Cache Error:", err);
      next(); // Fail open if Redis drops
    }
  };
};

export const clearRedisPattern = async (pattern) => {
  try {
    const keys = await redisClient.keys(`*${pattern}*`);
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
  } catch (err) {
    console.error("Error purging Redis pattern:", err);
  }
};