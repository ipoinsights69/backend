/**
 * IPO Scraper - Express API Server
 * Ultra-optimized for high performance on limited resources (1GB RAM, 1 core CPU)
 */
const express = require('express');
const compression = require('compression');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const { connectToDatabase, isConnectedToDatabase } = require('./config/database');
const cronManager = require('./utils/cronManager');
const Redis = require('ioredis');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const cluster = require('cluster');
const os = require('os');
require('dotenv').config();

// Constants
const PORT = process.env.PORT || 3000;
const WORKERS = process.env.NODE_ENV === 'production' ? 1 : 1; // Use 1 worker for limited resources
const ENABLE_REDIS = process.env.ENABLE_REDIS === 'true';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const CACHE_TTL = parseInt(process.env.CACHE_TTL || '300', 10); // 5 minutes

// Set up Redis client if enabled
let redisClient;
if (ENABLE_REDIS) {
  try {
    redisClient = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 1000,
      enableOfflineQueue: false
    });
    
    redisClient.on('error', (err) => {
      console.warn('Redis error, will use in-memory cache instead:', err.message);
      // Don't terminate on Redis errors - just fallback to memory cache
    });
    
    console.log('Redis cache enabled');
  } catch (err) {
    console.warn('Redis initialization failed, will use in-memory cache instead:', err.message);
  }
}

// Handle clustering for better resource utilization
if (cluster.isMaster && process.env.NODE_ENV === 'production') {
  console.log(`Master ${process.pid} is running`);
  
  // Fork workers
  for (let i = 0; i < WORKERS; i++) {
    cluster.fork();
  }
  
  // Handle worker crashes
  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died (${signal || code}). Restarting...`);
    cluster.fork();
  });
} else {
  // Worker code
  startServer();
}

// In-memory cache as fallback if Redis unavailable
const memoryCache = {
  data: new Map(),
  maxItems: 100,
  defaultTtl: CACHE_TTL * 1000,
  
  // Get item from cache
  get(key) {
    const item = this.data.get(key);
    if (!item) return null;
    
    // Return null if expired
    if (item.expiresAt < Date.now()) {
      this.data.delete(key);
      return null;
    }
    
    item.lastAccessed = Date.now();
    return item.data;
  },
  
  // Set item in cache
  set(key, data, ttl = this.defaultTtl) {
    // LRU eviction if cache is full
    if (this.data.size >= this.maxItems) {
      let oldest = null;
      let oldestKey = null;
      
      for (const [k, v] of this.data.entries()) {
        if (!oldest || v.lastAccessed < oldest) {
          oldest = v.lastAccessed;
          oldestKey = k;
        }
      }
      
      if (oldestKey) this.data.delete(oldestKey);
    }
    
    this.data.set(key, {
      data,
      expiresAt: Date.now() + ttl,
      lastAccessed: Date.now()
    });
  },
  
  clear() {
    this.data.clear();
  }
};

/**
 * Cache middleware with Redis primary and in-memory fallback
 * @param {number} duration - Cache duration in seconds
 */
function cacheMiddleware(duration = CACHE_TTL) {
  return (req, res, next) => {
    // Skip caching for non-GET requests
    if (req.method !== 'GET') return next();
    
    const key = `api:${req.originalUrl}`;
    
    // Check Redis cache first if available
    const checkRedisCache = async () => {
      if (redisClient && redisClient.status === 'ready') {
        try {
          const result = await redisClient.get(key);
          if (result) {
            const cachedData = JSON.parse(result);
            res.setHeader('X-Cache', 'HIT:REDIS');
            return res.json(cachedData);
          }
        } catch (err) {
          // Fall through to memory cache on Redis error
          console.warn('Redis cache error, using memory cache:', err.message);
        }
      }
      
      // Check memory cache if Redis fails or has no data
      const memoryCachedData = memoryCache.get(key);
      if (memoryCachedData) {
        res.setHeader('X-Cache', 'HIT:MEMORY');
        return res.json(memoryCachedData);
      }
      
      // Neither cache had the data, continue to the handler
      setupCaching();
    };
    
    // Set up response caching
    const setupCaching = () => {
      // Store original json method
      const originalJson = res.json;
      
      // Override json method
      res.json = function(body) {
        // Only cache success responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
          // Try Redis first
          if (redisClient && redisClient.status === 'ready') {
            redisClient.set(key, JSON.stringify(body), 'EX', duration)
              .catch(() => {
                // Fallback to memory cache on Redis error
                memoryCache.set(key, body, duration * 1000);
              });
          } else {
            // Use memory cache
            memoryCache.set(key, body, duration * 1000);
          }
          
          res.setHeader('X-Cache', 'MISS');
        }
        
        return originalJson.call(this, body);
      };
      
      // Add cache control headers
      res.setHeader('Cache-Control', `public, max-age=${duration}`);
      next();
    };
    
    // Start the caching process
    checkRedisCache().catch(err => {
      console.error('Cache error:', err);
      next(); // Continue without caching on error
    });
  };
}

function createApp() {
  const app = express();
  
  // Optimize compression - very important for limited bandwidth
  app.use(compression({
    level: 6,
    threshold: 500, // Only compress responses > 500 bytes
    filter: (req, res) => {
      return req.headers['x-no-compression'] ? false : compression.filter(req, res);
    }
  }));
  
  // Security with minimal overhead
  app.use(helmet({
    contentSecurityPolicy: false, // Disable CSP for API-only server (saves CPU)
    dnsPrefetchControl: false // Disable DNS prefetch control (saves CPU)
  }));
  
  // Prevent MongoDB injection attacks
  app.use(mongoSanitize());
  
  // Minimal CORS setup
  const corsOptions = {
    origin: process.env.CORS_ORIGIN || '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    preflightContinue: false,
    optionsSuccessStatus: 204
  };
  app.use(cors(corsOptions));
  
  // Setup lean logging only in production
  if (process.env.NODE_ENV === 'production') {
    const logsDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    const accessLogStream = fs.createWriteStream(
      path.join(logsDir, 'access.log'),
      { flags: 'a' }
    );
    
    // Use a smaller format to save disk space
    app.use(morgan('tiny', { stream: accessLogStream }));
  } else {
    app.use(morgan('dev'));
  }
  
  // Rate limiting with minimal overhead
  const apiLimiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests' },
    skip: (req) => req.path === '/api/health',
    // Don't use Redis store in memory-constrained environments
    // This adds overhead without significant benefit on small servers
    skipSuccessfulRequests: true // Don't count successful requests against limit
  });
  
  // Apply rate limiting to API routes
  app.use('/api', apiLimiter);
  
  // JSON parsing with size limits for DoS protection
  app.use(express.json({ 
    limit: '100kb', // Restrict to small payloads
    strict: true,
    // Apply only to routes that need it
    type: ['application/json'],
    // Skip if content-length header is too large - fast fail
    verify: (req, res, buf, encoding) => {
      if (buf.length > 102400) {
        throw new Error('Request entity too large');
      }
    }
  }));
  
  // Minimal URL encoded parsing, only where needed
  app.use(express.urlencoded({ 
    extended: false, // Use querystring instead of qs for better performance
    limit: '100kb' 
  }));
  
  // Serve static files with aggressive caching
  app.use(express.static('public', {
    maxAge: '1d',
    etag: true,
    lastModified: true,
    immutable: true // Indicates the resource never changes
  }));
  
  // Ultra-fast health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: isConnectedToDatabase() ? 'ok' : 'db_error',
      time: Date.now()
    });
  });
  
  return app;
}

// Set up API routes
function setupRoutes(app) {
  // Import route handlers
  const ipoRoutes = require('./routes/api/ipoRoutes');
  const adminRoutes = require('./routes/api/adminRoutes');
  
  // Use the correct path prefix for each route module
  app.use('/api/admin', adminRoutes);
  app.use('/api/ipos', ipoRoutes);
  
  // Add cache middleware AFTER all routes are registered
  app.use('/api/ipos', (req, res, next) => {
    // Skip if headers already sent (route handled)
    if (res.headersSent) return next();
    
    // Skip caching for non-GET or write operations
    if (req.method === 'GET') {
      console.log(`Adding cache to unhandled route: ${req.path}`);
      cacheMiddleware(CACHE_TTL)(req, res, next);
    } else {
      next();
    }
  });
  
  // API documentation - cached for 1 hour
  app.get('/api', cacheMiddleware(3600), (req, res) => {
    res.json({
      message: 'IPO API Server',
      version: '1.0.0',
      endpoints: [
        { path: '/api/ipos', method: 'GET', description: 'Get all IPOs with pagination' },
        { path: '/api/ipos/search', method: 'GET', description: 'Search IPOs by keyword' },
        { path: '/api/ipos/:id', method: 'GET', description: 'Get IPO by ID' },
        { path: '/api/ipos/ids', method: 'GET', description: 'Get all IPO IDs' },
        { path: '/api/ipos/years', method: 'GET', description: 'Get years with IPO data' },
        { path: '/api/ipos/status/:status', method: 'GET', description: 'Get IPOs by status' },
        { path: '/api/ipos/performance', method: 'GET', description: 'Get IPOs by performance' },
        { path: '/api/ipos/:id/detail', method: 'GET', description: 'Get detailed IPO information' },
        { path: '/api/ipos/:id/section', method: 'GET', description: 'Get specific section of IPO data' },
        { path: '/api/ipos/:id/sections', method: 'GET', description: 'Get available IPO sections' }
      ],
      admin_endpoints: [
        { path: '/api/admin/status', method: 'GET', description: 'Get system status' },
        { path: '/api/admin/logs/:filename', method: 'GET', description: 'Get specific log file' },
        { path: '/api/admin/scrape', method: 'POST', description: 'Trigger an IPO scraping job' },
        { path: '/api/admin/job/:id', method: 'GET', description: 'Get status of a specific job' },
        { path: '/api/admin/cron', method: 'GET', description: 'Get all cron jobs' },
        { path: '/api/admin/cron', method: 'POST', description: 'Create or update a cron job' },
        { path: '/api/admin/cron/:name', method: 'DELETE', description: 'Delete a cron job' },
        { path: '/api/admin/ipo', method: 'POST', description: 'Add or update an IPO' },
        { path: '/api/admin/ipo/:id', method: 'DELETE', description: 'Delete an IPO' },
        { path: '/api/admin/stats', method: 'GET', description: 'Get database statistics' }
      ]
    });
  });
  
  // Optimized error handler - minimal stack traces in production
  app.use((err, req, res, next) => {
    console.error('Server error:', err.message);
    
    // Only log full stack trace in development
    if (process.env.NODE_ENV !== 'production') {
      console.error(err.stack);
    }
    
    res.status(500).json({
      error: 'Server error',
      message: process.env.NODE_ENV !== 'production' ? err.message : 'An unexpected error occurred'
    });
  });
  
  // Minimal 404 handler - routes not handled by the router
  app.use((req, res) => {
    console.log(`404 Not Found: ${req.method} ${req.path}`);
    res.status(404).json({ 
      error: 'Not Found',
      path: req.path,
      method: req.method
    });
  });
}

// Import the setup script
const setupStartupCron = require('./scripts/setupStartupCron');

// Initialize the server
async function startServer() {
  try {
    // Connect to MongoDB
    await connectToDatabase();
    console.log('MongoDB connected successfully');
    
    // Create Express app
    const app = createApp();
    
    // Setup routes
    setupRoutes(app);
    
    // Setup cron jobs with new script (only on primary/single process)
    if (!cluster.isWorker || cluster.worker.id === 1) {
      await setupStartupCron();
    }
    
    // Start server
    app.listen(PORT, () => {
      console.log(`✅ Server ${process.pid} running on http://localhost:${PORT}`);
      
      // Only log detailed info on primary/single process
      if (!cluster.isWorker || cluster.worker.id === 1) {
        console.log(`💾 Memory: ${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)}MB`);
      }
    });
    
    // Cleanup expired cache items periodically
    if (!cluster.isWorker || cluster.worker.id === 1) {
      setInterval(() => {
        // Clear expired items by attempting to get them
        for (const key of memoryCache.data.keys()) {
          memoryCache.get(key);
        }
      }, 60000); // Every minute
    }
    
    // Handle graceful shutdown
    const gracefulShutdown = async () => {
      console.log('Shutting down gracefully...');
      
      // Only run cleanup on primary/single process
      if (!cluster.isWorker || cluster.worker.id === 1) {
        // Close Redis connection if exists
        if (redisClient) {
          await redisClient.quit();
        }
        
        // Shutdown cron jobs
        await cronManager.shutdown();
      }
      
      process.exit(0);
    };
    
    // Attach shutdown handlers
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
    
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

// Export for testing
module.exports = { createApp }; 