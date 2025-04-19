import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable');
}

/**
 * Global is used here to maintain a cached connection across hot reloads
 * in development. This prevents connections growing exponentially
 * during API Route usage.
 */
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

export async function connectToDatabase() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    // Base connection options - these are always safe
    const opts = {
      bufferCommands: false,
      maxPoolSize: parseInt(process.env.MONGO_POOL_SIZE || '10', 10),
      minPoolSize: 3,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4
    };

    // IMPORTANT: Never use both autoIndex and readPreference:secondaryPreferred together
    // as MongoDB prohibits this combination
    const env = process.env.NODE_ENV || 'development';
    
    if (env === 'production') {
      // In production, focus on performance - disable auto-indexing
      opts.autoIndex = false;
      // Can safely use secondaryPreferred for better read scaling
      opts.readPreference = 'secondaryPreferred';
    } else {
      // In development, focus on convenience - enable auto-indexing
      opts.autoIndex = true;
      // Must use primary read preference with autoIndex
      // Don't set readPreference, which defaults to primary
    }

    // For debugging
    console.log(`MongoDB connecting with options: ${JSON.stringify({
      ...opts,
      uri: MONGODB_URI.substring(0, MONGODB_URI.indexOf('@') > 0 ? 
        MONGODB_URI.indexOf('@') : 10) + '...'
    })}`);

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
      console.log('MongoDB connected successfully');
      return mongoose;
    });
  }
  
  try {
    cached.conn = await cached.promise;
    
    // Performance optimization - set lean queries as default
    mongoose.Query.prototype._executionStack = null;
      
    // Optimize default find queries by setting lean by default
    const originalFind = mongoose.Query.prototype.find;
    mongoose.Query.prototype.find = function() {
      if (!this._mongooseOptions || !this._mongooseOptions.hasOwnProperty('lean')) {
        this.lean(true);
      }
      return originalFind.apply(this, arguments);
    };
    
    return cached.conn;
  } catch (e) {
    console.error('MongoDB connection failed:', e.message);
    cached.promise = null;
    throw e;
  }
}

export function getMongoClient() {
  if (!cached.conn) {
    throw new Error('Call connectToDatabase first!');
  }
  return cached.conn.connection.client;
}

export function isConnected() {
  return cached.conn?.connection?.readyState === 1;
} 