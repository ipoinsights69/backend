const { workerThread } = require('../utils/threadManager');
const { fetchIpoListings } = require('../scraper/ipoListingScraper');
const { saveToJson } = require('../utils/helpers');
const { uploadIpoListings } = require('../utils/mongoDbHelper');
const path = require('path');

/**
 * Process IPO listings for a specific year in a worker thread
 * @param {Number} year - Year to fetch listings for
 * @param {Object} options - Additional options
 */
async function processYearListingsInWorker(year, options) {
  const { threadId, dataDir, uploadToMongo, force } = options;
  
  try {
    console.log(`[Thread ${threadId}] Fetching IPO listings for year ${year}`);
    
    // Fetch IPO listings for the year
    const ipoListings = await fetchIpoListings(year, force);
    
    if (!ipoListings || ipoListings.length === 0) {
      console.log(`[Thread ${threadId}] No IPO listings found for year ${year}`);
      return {
        year,
        count: 0,
        success: true
      };
    }
    
    console.log(`[Thread ${threadId}] Found ${ipoListings.length} IPO listings for year ${year}`);
    
    // Save listings summary to file
    const listingsDir = path.join(dataDir, year.toString());
    await saveToJson(listingsDir, '_listings.json', ipoListings);
    console.log(`[Thread ${threadId}] Saved listings summary for year ${year}`);
    
    // Upload listings to MongoDB if enabled
    if (uploadToMongo) {
      try {
        await uploadIpoListings(ipoListings, year.toString());
        console.log(`[Thread ${threadId}] Uploaded IPO listings for year ${year} to MongoDB`);
      } catch (mongoError) {
        console.error(`[Thread ${threadId}] MongoDB upload error for year ${year} listings:`, mongoError.message);
      }
    }
    
    return {
      year,
      listings: ipoListings,
      count: ipoListings.length,
      success: true
    };
  } catch (error) {
    console.error(`[Thread ${threadId}] Error processing listings for year ${year}:`, error.message);
    return {
      year,
      success: false,
      error: error.message
    };
  }
}

// Start worker processing if this is run as a worker thread
workerThread(processYearListingsInWorker); 