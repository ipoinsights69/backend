const path = require('path');
const { fetchIpoListings } = require('../scraper/ipoListingScraper');
const { fetchStructuredData } = require('../scraper/ipoDetailScraper');
const { saveToJson, sanitizeFilename, extractIpoId, ensureDirectoryExists } = require('../utils/helpers');
require('dotenv').config();

// Base directory for data storage
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

// Configure throttling
const DELAY_BETWEEN_REQUESTS = parseInt(process.env.DELAY_BETWEEN_REQUESTS || '1000', 10);
const MAX_CONCURRENT_REQUESTS = parseInt(process.env.MAX_CONCURRENT_REQUESTS || '3', 10);

// Delay function to prevent rate limiting
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Processes a single IPO, fetching details and saving to file
 * @param {Object} ipo - Basic IPO information with detail_url
 * @param {string} year - Year for organization
 * @returns {Promise<Object>} - Processed IPO data
 */
async function processIpo(ipo, year) {
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
 */
async function processBatch(ipos, year) {
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
        const result = await processIpo(ipo, year);
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
 */
async function scrapeIposByYearRange(startYear, endYear) {
  console.log(`Starting IPO scraping for years ${startYear}-${endYear}`);
  
  try {
    // Ensure data directory exists
    await ensureDirectoryExists(DATA_DIR);
    
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
      await processBatch(ipoListings, year.toString());
    }
    
    console.log('\nIPO scraping completed successfully!');
    return true;
  } catch (error) {
    console.error('Error during IPO scraping:', error);
    return false;
  }
}

// Parse command line arguments in a more robust way
function parseArgs(args) {
  const options = {
    year: new Date().getFullYear(),
    startYear: null,
    endYear: null,
    threads: MAX_CONCURRENT_REQUESTS,
    overwrite: false
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--year' && i + 1 < args.length) {
      const year = parseInt(args[++i], 10);
      if (!isNaN(year)) {
        options.year = year;
        // Set start and end year to the same value if not explicitly set
        if (options.startYear === null) options.startYear = year;
        if (options.endYear === null) options.endYear = year;
      }
    }
    else if (arg === '--start-year' && i + 1 < args.length) {
      const year = parseInt(args[++i], 10);
      if (!isNaN(year)) options.startYear = year;
    }
    else if (arg === '--end-year' && i + 1 < args.length) {
      const year = parseInt(args[++i], 10);
      if (!isNaN(year)) options.endYear = year;
    }
    else if (arg === '--threads' && i + 1 < args.length) {
      const threads = parseInt(args[++i], 10);
      if (!isNaN(threads) && threads > 0) {
        options.threads = threads;
        process.env.MAX_CONCURRENT_REQUESTS = threads.toString();
      }
    }
    else if (arg === '--overwrite') {
      options.overwrite = true;
    }
    // Legacy positional argument support (deprecated)
    else if (i === 0 && !arg.startsWith('--')) {
      const year = parseInt(arg, 10);
      if (!isNaN(year)) {
        options.year = year;
        options.startYear = year;
        options.endYear = year;
        console.warn('WARNING: Using positional arguments is deprecated. Please use --year, --start-year, and --end-year instead.');
      }
    }
  }
  
  // If start-year or end-year was not explicitly set, use the year value
  if (options.startYear === null) options.startYear = options.year;
  if (options.endYear === null) options.endYear = options.year;
  
  return options;
}

// Handle direct execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = parseArgs(args);
  
  console.log('Starting IPO scraper with options:', options);
  
  scrapeIposByYearRange(options.startYear, options.endYear)
    .then(() => {
      console.log('Scraping process completed.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = {
  scrapeIposByYearRange,
  processIpo,
  parseArgs
}; 