import { getRedisClient } from './redis';
import { LRUCache } from 'lru-cache';

// In-memory store for rate limiting (used when Redis is not available)
const memoryStore = new LRUCache({
  max: 5000, // Maximum number of IP addresses to track
  ttl: 1000 * 60 * 5, // 5 minutes TTL
});

/**
 * Rate limiting middleware
 * @param {Object} options - Rate limiting options
 * @param {number} options.limit - Maximum number of requests per window
 * @param {number} options.window - Time window in seconds
 * @returns {Function} - Middleware function
 */
export function rateLimit({ limit = 100, window = 60 } = {}) {
  return async (req, res, next) => {
    // Get client IP
    const ip = (req.headers['x-forwarded-for'] || req.connection.remoteAddress || '').split(',')[0].trim();
    
    // Skip rate limiting for localhost in development
    if (process.env.NODE_ENV === 'development' && (ip === '127.0.0.1' || ip === '::1')) {
      return next();
    }
    
    // Generate key for this route and IP
    const key = `ratelimit:${ip}:${req.url}`;
    
    // Try Redis first if available
    const redisClient = getRedisClient();
    if (redisClient) {
      try {
        // Use Redis for rate limiting with MULTI for atomicity
        const multi = redisClient.multi();
        multi.incr(key);
        multi.expire(key, window);
        const [count] = await multi.exec();
        
        // Set rate limit headers
        res.setHeader('X-RateLimit-Limit', limit);
        res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - count));
        res.setHeader('X-RateLimit-Reset', Math.floor(Date.now() / 1000) + window);
        
        // If over limit, return 429 Too Many Requests
        if (count > limit) {
          return res.status(429).json({
            error: 'Too many requests, please try again later',
            success: false
          });
        }
        
        return next();
      } catch (error) {
        console.error('Redis rate limiting error:', error);
        // Fall back to memory store
      }
    }
    
    // Memory store fallback
    let count = memoryStore.get(key) || 0;
    count++;
    
    // Set or reset TTL
    memoryStore.set(key, count, { ttl: window * 1000 });
    
    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - count));
    res.setHeader('X-RateLimit-Reset', Math.floor(Date.now() / 1000) + window);
    
    // If over limit, return 429 Too Many Requests
    if (count > limit) {
      return res.status(429).json({
        error: 'Too many requests, please try again later',
        success: false
      });
    }
    
    return next();
  };
} 