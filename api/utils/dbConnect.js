const mongoose = require('mongoose');
const Ipo = require('../models/Ipo');
const IpoDetail = require('../models/IpoDetail');

// Connection URL from environment variables or default
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'ipo_data';

/**
 * Connect to MongoDB with retry mechanism
 * @returns {Promise} - Mongoose connection
 */
const connectToDatabase = async () => {
  try {
    console.log('Connecting to MongoDB...');
    
    // Set mongoose options
    mongoose.set('strictQuery', false);
    
    // Setup connection string
    const connectionString = `${MONGODB_URI}/${MONGODB_DB_NAME}`;
    
    // Connect to MongoDB
    await mongoose.connect(connectionString, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('MongoDB connected successfully');
    
    // Setup indexes
    await setupIndexes();
    
    return mongoose.connection;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
};

/**
 * Setup database indexes
 */
const setupIndexes = async () => {
  try {
    console.log('Setting up database indexes...');
    
    // Ensure indexes on IPO model
    await Ipo.ensureIndexes();
    
    // Ensure indexes on IPO Detail model
    await IpoDetail.ensureIndexes();
    
    console.log('Database indexes setup complete');
  } catch (error) {
    console.error('Error setting up indexes:', error);
    // Do not throw, allow application to continue
  }
};

/**
 * Disconnect from MongoDB
 */
const disconnectFromDatabase = async () => {
  try {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error('Error disconnecting from MongoDB:', error);
  }
};

module.exports = {
  connectToDatabase,
  disconnectFromDatabase
}; 