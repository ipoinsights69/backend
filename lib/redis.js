import { Redis } from 'ioredis';
import { LRUCache } from 'lru-cache';

// In-memory LRU cache as fallback or for ultra-fast responses
const memoryCache = new LRUCache({
  max: 500, // Maximum number of items
  ttl: 1000 * 60 * 5, // 5 minutes default TTL
  allowStale: false,
  updateAgeOnGet: false,
  updateAgeOnHas: false,
});

// Singleton pattern for Redis client
let redisClient = null;

// Check if Redis is enabled
const isRedisEnabled = () => {
  return process.env.REDIS_URL && process.env.USE_REDIS === 'true';
};

/**
 * Get Redis client instance
 */
export const getRedisClient = () => {
  if (!isRedisEnabled()) return null;

  if (!redisClient) {
    try {
      redisClient = new Redis(process.env.REDIS_URL, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: false,
        connectTimeout: 1000, // 1 second
        disconnectTimeout: 2000, // 2 seconds
        keepAlive: 30000, // 30 seconds
        enableOfflineQueue: false, // Reduce memory usage
      });

      // Handle errors
      redisClient.on('error', (err) => {
        console.error('Redis connection error:', err);
        redisClient = null;
      });
    } catch (error) {
      console.error('Failed to initialize Redis:', error);
      redisClient = null;
    }
  }

  return redisClient;
};

/**
 * Get data from cache (Redis or memory)
 * @param {string} key - Cache key
 * @returns {Promise<any>} - Cached data or null
 */
export const getCachedData = async (key) => {
  // First check memory cache for ultra-fast response
  if (memoryCache.has(key)) {
    return memoryCache.get(key);
  }

  // Then try Redis if available
  if (isRedisEnabled()) {
    const client = getRedisClient();
    if (client) {
      try {
        const data = await client.get(key);
        if (data) {
          const parsed = JSON.parse(data);
          // Store in memory cache for faster subsequent access
          memoryCache.set(key, parsed);
          return parsed;
        }
      } catch (error) {
        console.error(`Redis get error for key ${key}:`, error);
      }
    }
  }

  return null;
};

/**
 * Set data in cache (Redis and memory)
 * @param {string} key - Cache key
 * @param {any} data - Data to cache
 * @param {number} ttl - Time to live in seconds
 * @returns {Promise<boolean>} - Success status
 */
export const setCachedData = async (key, data, ttl = 300) => {
  // Set in memory cache
  memoryCache.set(key, data, { ttl: ttl * 1000 });

  // Set in Redis if available
  if (isRedisEnabled()) {
    const client = getRedisClient();
    if (client) {
      try {
        await client.setex(key, ttl, JSON.stringify(data));
        return true;
      } catch (error) {
        console.error(`Redis set error for key ${key}:`, error);
      }
    }
  }

  return false;
};

/**
 * Delete data from cache
 * @param {string} key - Cache key
 * @returns {Promise<boolean>} - Success status
 */
export const invalidateCache = async (key) => {
  // Remove from memory cache
  memoryCache.delete(key);

  // Remove from Redis if available
  if (isRedisEnabled()) {
    const client = getRedisClient();
    if (client) {
      try {
        await client.del(key);
        return true;
      } catch (error) {
        console.error(`Redis del error for key ${key}:`, error);
      }
    }
  }

  return false;
};

/**
 * Flush all cache data (use carefully)
 * @returns {Promise<boolean>} - Success status
 */
export const flushCache = async () => {
  // Clear memory cache
  memoryCache.clear();

  // Clear Redis if available
  if (isRedisEnabled()) {
    const client = getRedisClient();
    if (client) {
      try {
        await client.flushdb();
        return true;
      } catch (error) {
        console.error('Redis flush error:', error);
      }
    }
  }

  return false;
}; 