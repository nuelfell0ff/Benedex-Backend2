import NodeCache from "node-cache";

// Default TTL: 5 minutes (300s), cleanup check every 60s
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

/**
 * Route-level response caching middleware.
 * Generates an isolated key per request URL + authenticated user ID.
 *
 * @param {number} duration Cache TTL in seconds (default: 300)
 */
export const cacheRoute = (duration = 300) => {
  return (req, res, next) => {
    // Skip caching for non-GET requests (POST, PUT, DELETE)
    if (req.method !== "GET") {
      return next();
    }

    const userId = req.user ? req.user._id || req.user.id || "anonymous" : "public";
    const cacheKey = `cache:${req.originalUrl}:${userId}`;

    // Apply CDN & Browser Cache Control Headers for edge performance
    res.set({
      "Cache-Control": `private, max-age=${duration}, stale-while-revalidate=60`,
      "Vary": "Authorization, Cookie",
    });

    const cachedResponse = cache.get(cacheKey);

    if (cachedResponse) {
      return res.status(200).json(cachedResponse);
    }

    // Intercept res.json to cache response payload prior to sending
    const originalJson = res.json;
    res.json = function (body) {
      // Only cache successful 2xx responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        cache.set(cacheKey, body, duration);
      }
      return originalJson.call(this, body);
    };

    next();
  };
};

/**
 * Flush cache entries matching a specific substring pattern.
 * e.g., clearCachePattern("/api/instructor/dashboard")
 *
 * @param {string} pattern
 */
export const clearCachePattern = (pattern) => {
  const keys = cache.keys();
  const matchingKeys = keys.filter((key) => key.includes(pattern));
  if (matchingKeys.length > 0) {
    cache.del(matchingKeys);
  }
};

/**
 * Invalidate all cached routes for a specific user ID.
 * e.g., clearUserCache(req.user._id)
 *
 * @param {string} userId
 */
export const clearUserCache = (userId) => {
  if (!userId) return;
  const targetId = userId.toString();
  const keys = cache.keys();
  const userKeys = keys.filter((key) => key.endsWith(`:${targetId}`));
  if (userKeys.length > 0) {
    cache.del(userKeys);
  }
};

/**
 * Flush entire cache instance (emergency reset or system maintenance).
 */
export const clearAllCache = () => {
  cache.flushAll();
};