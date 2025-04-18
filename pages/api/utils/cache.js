import { serialize, deserialize } from 'v8';

// In-memory cache for development/small deployments
const memoryCache = new Map();

/**
 * Check if Redis is available
 * @returns {boolean} - Whether Redis is available
 */
const isRedisAvailable = () => {
  return process.env.REDIS_URL && process.env.USE_REDIS === 'true';
};

/**
 * Get Redis client
 * @returns {Object|null} - Redis client or null
 */
const getRedisClient = async () => {
  if (!isRedisAvailable()) return null;
  
  try {
    // Dynamic import to avoid requiring Redis in environments where it's not used
    const { createClient } = await import('redis');
    const client = createClient({
      url: process.env.REDIS_URL
    });
    
    await client.connect();
    return client;
  } catch (error) {
    console.error('Redis connection error:', error);
    return null;
  }
};

/**
 * Get data from cache
 * @param {string} key - Cache key
 * @param {number} ttl - Time to live in seconds
 * @returns {Promise<Object|null>} - Cached data or null
 */
export const getCachedData = async (key, ttl = 300) => {
  // Try Redis first if available
  if (isRedisAvailable()) {
    try {
      const client = await getRedisClient();
      if (!client) return null;
      
      const data = await client.get(key);
      await client.quit();
      
      if (data) {
        console.log(`Cache hit for key: ${key}`);
        return JSON.parse(data);
      }
      
      return null;
    } catch (error) {
      console.error('Redis get error:', error);
      // Fall back to memory cache if Redis fails
    }
  }
  
  // Memory cache fallback
  const cachedItem = memoryCache.get(key);
  
  if (cachedItem && cachedItem.expiry > Date.now()) {
    console.log(`Memory cache hit for key: ${key}`);
    return cachedItem.data;
  }
  
  return null;
};

/**
 * Set data in cache
 * @param {string} key - Cache key
 * @param {Object} data - Data to cache
 * @param {number} ttl - Time to live in seconds
 * @returns {Promise<boolean>} - Whether cache was set
 */
export const setCachedData = async (key, data, ttl = 300) => {
  // Try Redis first if available
  if (isRedisAvailable()) {
    try {
      const client = await getRedisClient();
      if (!client) return false;
      
      await client.setEx(key, ttl, JSON.stringify(data));
      await client.quit();
      
      return true;
    } catch (error) {
      console.error('Redis set error:', error);
      // Fall back to memory cache if Redis fails
    }
  }
  
  // Memory cache fallback
  memoryCache.set(key, {
    data,
    expiry: Date.now() + (ttl * 1000)
  });
  
  // Clean up expired items occasionally
  if (Math.random() < 0.1) {
    for (const [k, v] of memoryCache.entries()) {
      if (v.expiry < Date.now()) {
        memoryCache.delete(k);
      }
    }
  }
  
  return true;
};

/**
 * Clear cache for a specific key
 * @param {string} key - Cache key
 * @returns {Promise<boolean>} - Whether cache was cleared
 */
export const clearCacheKey = async (key) => {
  // Try Redis first if available
  if (isRedisAvailable()) {
    try {
      const client = await getRedisClient();
      if (!client) return false;
      
      await client.del(key);
      await client.quit();
      
      return true;
    } catch (error) {
      console.error('Redis delete error:', error);
    }
  }
  
  // Memory cache fallback
  memoryCache.delete(key);
  return true;
};

/**
 * Cache middleware for API handlers
 * @param {Function} handler - API handler
 * @param {number} ttl - Time to live in seconds (default: 60)
 * @returns {Function} - Cached API handler
 */
export const withCache = (handler, ttl = 60) => async (req, res) => {
  // Set cache control headers
  const cacheSeconds = parseInt(process.env.API_CACHE_TIME || String(ttl), 10);
  res.setHeader('Cache-Control', `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 2}`);
  
  return handler(req, res);
};

/**
 * Create a query projection object from requested sections
 * @param {string|string[]} sections - Sections to include
 * @returns {Object} - Projection object
 */
export const createProjection = (sections) => {
  if (!sections) return {};
  
  const projection = {};
  
  // Handle array of sections
  if (Array.isArray(sections)) {
    sections.forEach(section => {
      projection[section] = 1;
    });
    // Always include ipo_id, year and company_name
    projection.ipo_id = 1;
    projection.year = 1;
    projection.company_name = 1;
    return projection;
  }
  
  // Handle comma-separated string
  if (typeof sections === 'string') {
    sections.split(',').forEach(section => {
      projection[section.trim()] = 1;
    });
    // Always include ipo_id, year and company_name
    projection.ipo_id = 1;
    projection.year = 1;
    projection.company_name = 1;
    return projection;
  }
  
  return {};
}; 