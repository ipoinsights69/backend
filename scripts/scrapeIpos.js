const path = require('path');
const { fetchIpoListings } = require('../scraper/ipoListingScraper');
const { fetchStructuredData } = require('../scraper/ipoDetailScraper');
const { saveToJson, sanitizeFilename, extractIpoId, ensureDirectoryExists } = require('../utils/helpers');
const db = require('../config/database');
const IpoModel = require('../models/IpoModel');
const { smartUpdateIpo } = require('../utils/mongoUpdater');
require('dotenv').config();

// Base directory for data storage
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

// Configure throttling
const DELAY_BETWEEN_REQUESTS = parseInt(process.env.DELAY_BETWEEN_REQUESTS || '1000', 10);
const MAX_CONCURRENT_REQUESTS = parseInt(process.env.MAX_CONCURRENT_REQUESTS || '3', 10);

// Delay function to prevent rate limiting
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Processes a single IPO, fetching details and saving to file and database
 * @param {Object} ipo - Basic IPO information with detail_url
 * @param {string} year - Year for organization
 * @param {boolean} saveToMongo - Whether to save to MongoDB
 * @returns {Promise<Object>} - Processed IPO data
 */
async function processIpo(ipo, year, saveToMongo = false) {
  try {
    if (!ipo.detail_url) {
      console.warn(`Missing detail URL for IPO: ${ipo.company_name}`);
      return null;
    }

    // Full URL if it's a relative URL
    const fullUrl = ipo.detail_url.startsWith('http') 
      ? ipo.detail_url 
      : `https://www.chittorgarh.com${ipo.detail_url}`;

    console.log(`Processing IPO: ${ipo.company_name} (${fullUrl})`);
    
    // Fetch detailed IPO data
    const ipoData = await fetchStructuredData(fullUrl);
    
    if (ipoData._error) {
      console.error(`Error fetching data for ${ipo.company_name}: ${ipoData.message}`);
      return null;
    }

    // Save to file system (organized by year)
    const yearDir = path.join(DATA_DIR, year.toString());
    const companyName = sanitizeFilename(ipo.company_name);
    const fileName = `${companyName}.json`;
    
    await saveToJson(yearDir, fileName, ipoData);
    console.log(`Saved ${ipo.company_name} data to ${path.join(yearDir, fileName)}`);

    // Save to MongoDB if enabled
    if (saveToMongo) {
      try {
        // Extract IPO ID for database
        const ipoId = extractIpoId(fullUrl) || `${year}_${companyName}`;
        const enrichedData = { ...ipoData, ipo_id: ipoId };

        // Use smart update instead of simple upsert
        const existingIpo = await IpoModel.findOne({ ipo_id: ipoId });
        
        if (!existingIpo) {
          // If it's a new IPO, use the regular upsert
          const result = await IpoModel.upsertIpo(enrichedData);
          console.log(`Created new IPO in database with ID: ${result.ipo_id}`);
        } else {
          // If it exists, use smart update to only update changed fields
          const result = await smartUpdateIpo(enrichedData);
          if (result.updated_at > existingIpo.updated_at) {
            console.log(`Updated IPO ${ipoId} with selective changes`);
          } else {
            console.log(`No changes detected for IPO ${ipoId}`);
          }
        }
      } catch (dbError) {
        console.error(`Database error for ${ipo.company_name}:`, dbError.message);
      }
    }

    return ipoData;
  } catch (error) {
    console.error(`Error processing IPO ${ipo.company_name}:`, error);
    return null;
  }
}

/**
 * Processes a batch of IPOs with concurrency control
 * @param {Array} ipos - Array of IPO listings
 * @param {string} year - Year for organization
 * @param {boolean} saveToMongo - Whether to save to MongoDB
 */
async function processBatch(ipos, year, saveToMongo) {
  const results = [];
  
  // Filter out IPOs without valid detail URLs
  const validIpos = ipos.filter(ipo => ipo && ipo.detail_url);
  const pendingIpos = [...validIpos];
  
  console.log(`Processing ${pendingIpos.length} IPOs for year ${year} with max ${MAX_CONCURRENT_REQUESTS} concurrent requests`);
  
  // Process in batches with controlled concurrency
  const activePromises = new Set();
  
  while (pendingIpos.length > 0 || activePromises.size > 0) {
    // Fill up to max concurrent requests
    while (pendingIpos.length > 0 && activePromises.size < MAX_CONCURRENT_REQUESTS) {
      const ipo = pendingIpos.shift();
      const promise = (async () => {
        const result = await processIpo(ipo, year, saveToMongo);
        if (result) results.push(result);
        activePromises.delete(promise);
        
        // Add delay between requests
        await delay(DELAY_BETWEEN_REQUESTS);
      })();
      
      activePromises.add(promise);
    }
    
    // Wait for at least one promise to complete
    if (activePromises.size > 0) {
      await Promise.race(activePromises);
    }
  }
  
  return results;
}

/**
 * Main function to scrape IPOs for a given year range
 * @param {number} startYear - Start year
 * @param {number} endYear - End year (inclusive)
 * @param {boolean} saveToMongo - Whether to save to MongoDB
 */
async function scrapeIposByYearRange(startYear, endYear, saveToMongo = false) {
  console.log(`Starting IPO scraping for years ${startYear}-${endYear}`);
  
  try {
    // Ensure data directory exists
    await ensureDirectoryExists(DATA_DIR);
    
    // Connect to database if needed
    if (saveToMongo) {
      await db.connectToDatabase();
    }
    
    // Process each year
    for (let year = startYear; year <= endYear; year++) {
      console.log(`\n--- Processing Year: ${year} ---`);
      
      // Fetch IPO listings for the year
      const ipoListings = await fetchIpoListings(year);
      
      if (!ipoListings || ipoListings.length === 0) {
        console.log(`No IPO listings found for year ${year}`);
        continue;
      }
      
      console.log(`Found ${ipoListings.length} IPO listings for year ${year}`);
      
      // Save listings summary
      const listingsDir = path.join(DATA_DIR, year.toString());
      await saveToJson(listingsDir, '_listings.json', ipoListings);
      
      // Process all IPOs for this year
      await processBatch(ipoListings, year.toString(), saveToMongo);
    }
    
    console.log('\nIPO scraping completed successfully!');
  } catch (error) {
    console.error('Error during IPO scraping:', error);
  } finally {
    // Disconnect from database if connected
    if (saveToMongo) {
      await db.disconnectFromDatabase();
    }
  }
}

// Handle direct execution
if (require.main === module) {
  // Get command line arguments
  const args = process.argv.slice(2);
  const startYear = parseInt(args[0] || new Date().getFullYear(), 10);
  const endYear = parseInt(args[1] || startYear, 10);
  const saveToMongo = args[2] === 'true' || args[2] === '--mongo';

  // Start the scraping process
  scrapeIposByYearRange(startYear, endYear, saveToMongo)
    .then(() => {
      console.log('Scraping process completed.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

// Export functions for use in other files
module.exports = {
  scrapeIposByYearRange,
  processIpo,
  processBatch
}; 