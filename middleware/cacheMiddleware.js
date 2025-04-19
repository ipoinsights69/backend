const cache = require('../utils/cache');

const cacheMiddleware = (req, res, next) => {
  // Use the request URL as the cache key
  // You might want a more sophisticated key generation strategy
  // depending on query parameters, user roles, etc.
  const key = req.originalUrl || req.url;
  const cachedResponse = cache.get(key);

  if (cachedResponse) {
    console.log(`Cache hit for key: ${key}`);
    res.send(cachedResponse);
  } else {
    console.log(`Cache miss for key: ${key}`);
    // If not in cache, monkey-patch res.send to cache the response before sending
    const originalSend = res.send;
    res.send = (body) => {
      // Only cache successful responses (e.g., status 200)
      // Adjust condition based on your API's success status codes
      if (res.statusCode >= 200 && res.statusCode < 300) {
          cache.set(key, body);
          console.log(`Cached response for key: ${key}`);
      }
      originalSend.call(res, body); // Call the original send method
    };
    next(); // Proceed to the actual route handler
  }
};

module.exports = cacheMiddleware; 