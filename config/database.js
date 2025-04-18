const mongoose = require('mongoose');
require('dotenv').config();

// Database connection URI
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ipo_data';

// Track connection status
let isConnected = false;

// Connection options
const options = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000, // Timeout after 5s
  maxPoolSize: parseInt(process.env.DB_POOL_SIZE || '10', 10), // Connection pooling
  socketTimeoutMS: 45000, // Close sockets after 45s
  family: 4 // Use IPv4, skip trying IPv6
};

// Connect to MongoDB
async function connectToDatabase() {
  // If we're already connected, return the existing connection
  if (isConnected) {
    console.log('Using existing MongoDB connection');
    return mongoose.connection;
  }

  try {
    // Set up event listeners for connection
    mongoose.connection.on('connected', () => {
      isConnected = true;
      console.log('MongoDB connected successfully');
    });

    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err);
      isConnected = false;
    });

    mongoose.connection.on('disconnected', () => {
      console.log('MongoDB disconnected');
      isConnected = false;
    });

    // Connect to the database
    await mongoose.connect(MONGODB_URI, options);
    isConnected = true;
    
    // Verify indexes after connection
    try {
      // We need to require the model here to avoid circular dependencies
      const IpoModel = require('../models/IpoModel');
      if (typeof IpoModel.verifyIndexes === 'function') {
        await IpoModel.verifyIndexes();
      }
    } catch (indexError) {
      console.error('Error verifying MongoDB indexes:', indexError);
      // Continue despite index verification errors
    }
    
    return mongoose.connection;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    isConnected = false;
    // Don't exit the process, let the calling code handle it
    throw error;
  }
}

// Disconnect from MongoDB
async function disconnectFromDatabase() {
  if (!isConnected) {
    console.log('No MongoDB connection to disconnect');
    return;
  }

  try {
    await mongoose.disconnect();
    isConnected = false;
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error('Error disconnecting from MongoDB:', error);
  }
}

module.exports = {
  connectToDatabase,
  disconnectFromDatabase,
  connection: mongoose.connection,
  isConnected: () => isConnected
}; 