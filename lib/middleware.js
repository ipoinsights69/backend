import { getCachedData, setCachedData } from './redis';
import { rateLimit } from './rate-limit';

/**
 * Caching middleware for Next.js API Routes
 * @param {number} ttl - Cache TTL in seconds
 * @param {Function} keyGenerator - Function to generate cache key (default: use request URL)
 * @returns {Function} - Middleware function
 */
export function withCache(ttl = 60, keyGenerator = null) {
  return async (req, res, handler) => {
    // Skip caching for non-GET requests
    if (req.method !== 'GET') {
      return handler(req, res);
    }

    // Generate cache key
    const cacheKey = keyGenerator 
      ? keyGenerator(req) 
      : `api:${req.url}`;

    // Try to get from cache
    const cachedData = await getCachedData(cacheKey);
    
    if (cachedData) {
      // Add cache header
      res.setHeader('X-Cache', 'HIT');
      
      // Set cache control headers
      res.setHeader(
        'Cache-Control', 
        `public, s-maxage=${ttl}, stale-while-revalidate=${ttl * 2}`
      );
      
      return res.status(200).json(cachedData);
    }

    // Create a new response object to capture the handler's response
    const originalJson = res.json;
    res.json = async (data) => {
      // Store in cache before sending response (don't await)
      setCachedData(cacheKey, data, ttl).catch(console.error);
      
      // Add cache header
      res.setHeader('X-Cache', 'MISS');
      
      // Set cache control headers
      res.setHeader(
        'Cache-Control', 
        `public, s-maxage=${ttl}, stale-while-revalidate=${ttl * 2}`
      );
      
      // Send the original response
      return originalJson.call(res, data);
    };

    // Call the handler
    return handler(req, res);
  };
}

/**
 * Combines multiple middleware functions
 * @param  {...Function} middlewares - Middleware functions
 * @returns {Function} - Combined middleware
 */
export function withMiddleware(...middlewares) {
  return async (req, res, handler) => {
    // Chain all middlewares
    const execMiddleware = async (index) => {
      if (index >= middlewares.length) {
        return handler(req, res);
      }
      
      const nextMiddleware = () => execMiddleware(index + 1);
      await middlewares[index](req, res, nextMiddleware);
    };
    
    return execMiddleware(0);
  };
}

/**
 * Performance and optimization middleware
 * @returns {Function} - Middleware function
 */
export function withOptimization() {
  return async (req, res, handler) => {
    // Add performance headers
    res.setHeader('X-DNS-Prefetch-Control', 'on');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    // Enable HTTP/2 server push if available
    if (res.push) {
      // Push critical assets
      res.push('/api/v1/ipos/stats', {
        request: { accept: '*/*' },
      });
    }
    
    return handler(req, res);
  };
}

/**
 * Error handling middleware
 * @returns {Function} - Middleware function
 */
export function withErrorHandler() {
  return async (req, res, handler) => {
    try {
      return await handler(req, res);
    } catch (error) {
      console.error(`API Error (${req.url}):`, error);
      
      // Don't expose internal error details in production
      const message = process.env.NODE_ENV === 'production'
        ? 'Internal Server Error'
        : error.message;
      
      return res.status(500).json({ 
        error: message,
        path: req.url,
        success: false
      });
    }
  };
}

/**
 * Combine all standard middleware
 * @param {number} cacheTtl - Cache TTL in seconds (0 to disable)
 * @param {Object} options - Additional options
 * @returns {Function} - Combined middleware
 */
export function withApiOptimizations(cacheTtl = 60, options = {}) {
  const middlewares = [
    withErrorHandler(),
    withOptimization(),
  ];
  
  // Add rate limiting if enabled
  if (options.rateLimit !== false) {
    const limit = options.rateLimit?.limit || 100;
    const window = options.rateLimit?.window || 60;
    middlewares.push(rateLimit({ limit, window }));
  }
  
  // Add caching if enabled
  if (cacheTtl > 0) {
    middlewares.push(withCache(cacheTtl, options.cacheKeyGenerator));
  }
  
  return withMiddleware(...middlewares);
} 