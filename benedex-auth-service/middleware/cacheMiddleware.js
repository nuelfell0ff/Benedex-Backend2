import NodeCache from "node-cache";

// Standard TTL: 5 minutes (300s), check for expired keys every 60s
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

/**
 * Route level response cacher.
 * Uses req.originalUrl + user id (if authenticated) as cache key.
 */
export const cacheRoute = (duration = 300) => {
  return (req, res, next) => {
    // Skip caching for non-GET requests
    if (req.method !== "GET") {
      return next();
    }

    const userId = req.user ? req.user._id || req.user.id || "anonymous" : "public";
    const cacheKey = `cache:${req.originalUrl}:${userId}`;

    // Microservice & Edge headers for fast responses
    res.set({
      "Cache-Control": `private, max-age=${duration}, stale-while-revalidate=60`,
      "Vary": "Authorization, Cookie",
    });

    const cachedResponse = cache.get(cacheKey);

    if (cachedResponse) {
      return res.status(200).json(cachedResponse);
    }

    // Intercept res.json to capture output and store in cache
    const originalJson = res.json;
    res.json = function (body) {
      // Only cache successful GET responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        cache.set(cacheKey, body, duration);
      }
      return originalJson.call(this, body);
    };

    next();
  };
};

/**
 * Flush cache pattern when data updates (e.g. user updated, ticket resolved)
 */
export const clearCachePattern = (pattern) => {
  const keys = cache.keys();
  const matchingKeys = keys.filter((key) => key.includes(pattern));
  if (matchingKeys.length) {
    cache.del(matchingKeys);
  }
};

/**
 * Specifically flush all cached Admin endpoints (Analytics & Tickets)
 */
export const clearAdminCache = () => {
  clearCachePattern("/api/admin");
};

/**
 * Flush all cached endpoints for a specific User ID
 */
export const clearUserCache = (userId) => {
  if (!userId) return;
  const targetId = userId.toString();
  const keys = cache.keys();
  const userKeys = keys.filter((key) => key.endsWith(`:${targetId}`));
  if (userKeys.length) {
    cache.del(userKeys);
  }
};

/**
 * Emergency cache flush
 */
export const clearAllCache = () => {
  cache.flushAll();
};