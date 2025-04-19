/**
 * Database Configuration
 * Optimized MongoDB connection with performance tuning for limited resources
 */
const mongoose = require('mongoose');
require('dotenv').config();

// Cache connection status
let isConnected = false;

// Get MongoDB connection options from environment
const MONGO_POOL_SIZE = parseInt(process.env.MONGO_POOL_SIZE || '5', 10);
const MONGO_TIMEOUT = parseInt(process.env.MONGO_TIMEOUT || '5000', 10);

/**
 * Connect to MongoDB database with optimized settings
 * @returns {Promise<mongoose.Connection>} Mongoose connection
 */
const connectToDatabase = async () => {
  // Return existing connection if available
  if (isConnected && mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }
  
  try {
    // Get MongoDB URI from environment
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ipo_db';
    
    // Configure options optimized for performance
    const options = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: MONGO_TIMEOUT,
      maxPoolSize: MONGO_POOL_SIZE, // Reduced pool size for limited memory
      minPoolSize: 1, // Keep at least one connection open
      connectTimeoutMS: 10000, // 10 seconds
      socketTimeoutMS: 45000, // 45 seconds
      family: 4, // Use IPv4, skip trying IPv6 (faster)
      // Disable auto-indexing in production
      autoIndex: process.env.NODE_ENV !== 'production',
      // Disable buffering for better memory usage
      bufferCommands: false
    };
    
    // Connect with optimized options
    const connection = await mongoose.connect(mongoUri, options);
    
    // Update connection status
    isConnected = true;
    
    // Configure connection for performance
    mongoose.set('bufferTimeoutMS', 2500); // Reduce timeout for better error handling
    
    // Log minimal connection info
    console.log('🔌 MongoDB connected');
    
    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err.message);
      isConnected = false;
    });
    
    mongoose.connection.on('disconnected', () => {
      console.warn('MongoDB disconnected');
      isConnected = false;
    });
    
    // Handle process termination
    process.on('SIGINT', async () => {
      try {
        await mongoose.connection.close();
        console.log('MongoDB connection closed');
        process.exit(0);
      } catch (err) {
        console.error('Error during MongoDB disconnection:', err.message);
        process.exit(1);
      }
    });
    
    return connection.connection;
  } catch (error) {
    isConnected = false;
    console.error('MongoDB connection error:', error.message);
    throw error;
  }
};

/**
 * Close database connection
 * @returns {Promise<void>}
 */
const disconnectFromDatabase = async () => {
  if (isConnected) {
    try {
      await mongoose.connection.close();
      isConnected = false;
      console.log('MongoDB disconnected');
    } catch (error) {
      console.error('Error disconnecting from MongoDB:', error.message);
      throw error;
    }
  }
};

/**
 * Check MongoDB connection status
 * @returns {boolean} Connection status
 */
const isConnectedToDatabase = () => {
  return isConnected && mongoose.connection.readyState === 1;
};

/**
 * Get database statistics for monitoring
 * @returns {Promise<Object>} Database statistics
 */
const getDatabaseStats = async () => {
  // Ensure connection exists
  if (!isConnectedToDatabase()) {
    await connectToDatabase();
  }
  
  try {
    // Get basic stats
    const db = mongoose.connection.db;
    
    // Use promise.all for faster parallel execution
    const [stats, ipoCount] = await Promise.all([
      db.stats(),
      mongoose.connection.db.collection('ipos').countDocuments()
    ]);
    
    return {
      database: db.databaseName,
      collections: stats.collections,
      documents: stats.objects,
      indexes: stats.indexes,
      ipoCount,
      storageSize: (stats.storageSize / (1024 * 1024)).toFixed(2) + ' MB',
      avgObjSize: stats.avgObjSize ? (stats.avgObjSize / 1024).toFixed(2) + ' KB' : '0 KB'
    };
  } catch (error) {
    console.error('Error getting database stats:', error.message);
    return { error: 'Failed to get database statistics' };
  }
};

module.exports = {
  connectToDatabase,
  disconnectFromDatabase,
  isConnectedToDatabase,
  getDatabaseStats
}; 