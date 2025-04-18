const express = require('express');
const next = require('next');
const db = require('./config/database');
const compression = require('compression');
require('dotenv').config();

// Determine if we're in development mode
const dev = process.env.NODE_ENV !== 'production';

// Initialize Next.js
const nextApp = next({ dev });
const handle = nextApp.getRequestHandler();

// Set port
const PORT = process.env.PORT || 3000;

// Start Next.js and then start Express
nextApp.prepare().then(() => {
  // Create Express app
  const app = express();
  
  // Apply compression
  app.use(compression());
  
  // Parse JSON body
  app.use(express.json());
  
  // Connect to database
  db.connectToDatabase().then(() => {
    console.log('MongoDB connected in server.js');
  }).catch(err => {
    console.error('Failed to connect to MongoDB:', err);
    // Continue server startup even with DB error
  });
  
  // Add server health check
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: db.isConnected() ? 'connected' : 'disconnected',
      environment: process.env.NODE_ENV || 'development'
    });
  });
  
  // Add API documentation route
  app.get('/api', (req, res) => {
    res.json({
      message: 'IPO API Server',
      version: '1.0.0',
      endpoints: [
        { path: '/api/ipos', description: 'Get all IPOs with pagination' },
        { path: '/api/ipos/:id', description: 'Get IPO by ID' },
        { path: '/api/ipos/ids', description: 'Get all IPO IDs' },
        { path: '/api/ipos/years', description: 'Get years with IPO data' },
        { path: '/api/ipos/status/:status', description: 'Get IPOs by status' },
        { path: '/api/ipos/performance', description: 'Get top/worst performing IPOs' }
      ]
    });
  });
  
  // Error handling middleware for API routes
  app.use('/api', (err, req, res, next) => {
    console.error('API error:', err);
    res.status(500).json({
      error: 'Server error',
      message: dev ? err.message : 'An unexpected error occurred'
    });
  });
  
  // Handle all other routes with Next.js
  app.all('*', (req, res) => {
    return handle(req, res);
  });
  
  // Start server
  app.listen(PORT, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Error starting Next.js:', err);
  process.exit(1);
}); 