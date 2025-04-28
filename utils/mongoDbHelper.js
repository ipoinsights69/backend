const { MongoClient } = require('mongodb');
require('dotenv').config();

// MongoDB connection string from environment variables
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'ipo_data';

// Collections
const COLLECTIONS = {
  IPO_LISTINGS: 'ipo_listings',
  IPO_DETAILS: 'ipo_details'
};

/**
 * Connect to MongoDB
 * @returns {Promise<MongoClient>} MongoDB client
 */
async function connectToMongoDB() {
  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    console.log('Connected to MongoDB');
    return client;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
}

/**
 * Uploads IPO listings to MongoDB
 * @param {Array} listings - Array of IPO listings
 * @param {string} year - Year of listings
 * @returns {Promise<Object>} - Result of the operation
 */
async function uploadIpoListings(listings, year) {
  let client;

  try {
    client = await connectToMongoDB();
    const db = client.db(MONGODB_DB_NAME);
    const collection = db.collection(COLLECTIONS.IPO_LISTINGS);

    // Add a timestamp and year to each listing
    const enhancedListings = listings.map(listing => ({
      ...listing,
      year: parseInt(year, 10),
      uploaded_at: new Date()
    }));

    // Prepare bulk operations - upsert based on company_name and year
    const bulkOps = enhancedListings.map(listing => ({
      updateOne: {
        filter: { company_name: listing.company_name, year: listing.year },
        update: { $set: listing },
        upsert: true
      }
    }));

    // Execute bulk operation
    const result = await collection.bulkWrite(bulkOps);
    console.log(`MongoDB: Processed ${enhancedListings.length} IPO listings for year ${year}`);
    console.log(`MongoDB: Inserted ${result.insertedCount}, Updated ${result.modifiedCount}, Matched ${result.matchedCount}`);
    
    return result;
  } catch (error) {
    console.error(`MongoDB error uploading IPO listings for year ${year}:`, error);
    throw error;
  } finally {
    if (client) {
      await client.close();
      console.log('MongoDB connection closed');
    }
  }
}

/**
 * Uploads a single IPO detail document to MongoDB
 * @param {Object} ipoData - IPO detail data
 * @param {Object} metadata - Additional metadata (company name, year)
 * @returns {Promise<Object>} - Result of the operation
 */
async function uploadIpoDetail(ipoData, metadata) {
  let client;

  try {
    client = await connectToMongoDB();
    const db = client.db(MONGODB_DB_NAME);
    const collection = db.collection(COLLECTIONS.IPO_DETAILS);

    // Add metadata and timestamp
    const enhancedData = {
      ...ipoData,
      company_name: metadata.company_name,
      year: parseInt(metadata.year, 10),
      uploaded_at: new Date()
    };

    // Create a unique identifier
    const uniqueId = metadata.company_name.toLowerCase().replace(/\s+/g, '_') + '_' + metadata.year;

    // Insert or update the document
    const result = await collection.updateOne(
      { company_name: metadata.company_name, year: parseInt(metadata.year, 10) },
      { $set: enhancedData },
      { upsert: true }
    );

    console.log(`MongoDB: Processed IPO detail for ${metadata.company_name} (${metadata.year})`);
    
    return result;
  } catch (error) {
    console.error(`MongoDB error uploading IPO detail for ${metadata.company_name}:`, error);
    throw error;
  } finally {
    if (client) {
      await client.close();
    }
  }
}

/**
 * Upload multiple IPO details to MongoDB
 * @param {Array} ipoDetailsArray - Array of IPO detail objects with metadata
 * @returns {Promise<Object>} - Result of the operation
 */
async function uploadIpoDetails(ipoDetailsArray) {
  let client;

  try {
    client = await connectToMongoDB();
    const db = client.db(MONGODB_DB_NAME);
    const collection = db.collection(COLLECTIONS.IPO_DETAILS);

    // Prepare bulk operations
    const bulkOps = ipoDetailsArray.map(item => ({
      updateOne: {
        filter: { company_name: item.metadata.company_name, year: parseInt(item.metadata.year, 10) },
        update: { 
          $set: {
            ...item.data,
            company_name: item.metadata.company_name,
            year: parseInt(item.metadata.year, 10),
            uploaded_at: new Date()
          }
        },
        upsert: true
      }
    }));

    // Execute bulk operation
    const result = await collection.bulkWrite(bulkOps);
    console.log(`MongoDB: Processed ${ipoDetailsArray.length} IPO details`);
    console.log(`MongoDB: Inserted ${result.insertedCount}, Updated ${result.modifiedCount}, Matched ${result.matchedCount}`);
    
    return result;
  } catch (error) {
    console.error(`MongoDB error uploading IPO details:`, error);
    throw error;
  } finally {
    if (client) {
      await client.close();
      console.log('MongoDB connection closed');
    }
  }
}

module.exports = {
  connectToMongoDB,
  uploadIpoListings,
  uploadIpoDetail,
  uploadIpoDetails,
  COLLECTIONS
}; 