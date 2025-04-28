const path = require('path');
const { fetchIpoListings } = require('../scraper/ipoListingScraper');
const { fetchStructuredData, fetchCompleteIpoData } = require('../scraper/ipoDetailScraper');
const { saveToJson, sanitizeFilename, extractIpoId, ensureDirectoryExists } = require('../utils/helpers');
const { uploadIpoListings, uploadIpoDetail, uploadIpoDetails } = require('../utils/mongoDbHelper');
const { processInThreads } = require('../utils/threadManager');
require('dotenv').config();

// Base directory for data storage
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

// Configure throttling
const DELAY_BETWEEN_REQUESTS = parseInt(process.env.DELAY_BETWEEN_REQUESTS || '1000', 10);
const MAX_CONCURRENT_REQUESTS = parseInt(process.env.MAX_CONCURRENT_REQUESTS || '10', 10);

// Enable/disable MongoDB upload
const UPLOAD_TO_MONGODB = process.env.UPLOAD_TO_MONGODB !== 'false';

// Enable/disable threaded processing
const USE_THREADS = process.env.USE_THREADS !== 'false';

// Set thread count
const THREAD_COUNT = parseInt(process.env.THREAD_COUNT || '4', 10);

// Delay function to prevent rate limiting
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Processes a single IPO, fetching details and saving to file and MongoDB
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
    
    // Use the new comprehensive data fetching function
    const ipoData = await fetchCompleteIpoData(fullUrl);
    
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

    // Upload to MongoDB if enabled
    if (UPLOAD_TO_MONGODB) {
      try {
        const metadata = {
          company_name: ipo.company_name,
          year: year
        };
        await uploadIpoDetail(ipoData, metadata);
        console.log(`Uploaded ${ipo.company_name} data to MongoDB`);
      } catch (mongoError) {
        console.error(`MongoDB upload error for ${ipo.company_name}:`, mongoError.message);
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
 */
async function processBatch(ipos, year) {
  // Filter out IPOs without valid detail URLs
  const validIpos = ipos.filter(ipo => ipo && ipo.detail_url);
  
  console.log(`Processing ${validIpos.length} IPOs for year ${year}`);
  
  // If threaded processing is enabled, use threads
  if (USE_THREADS) {
    console.log(`Using threaded processing with up to ${THREAD_COUNT} threads`);
    
    try {
      // Define worker script path for IPO detail processing
      const workerScriptPath = path.join(__dirname, '..', 'workers', 'ipoDetailWorker.js');
      
      // Set up options for threaded processing
      const threadOptions = {
        maxThreads: THREAD_COUNT,
        workerData: {
          year: year,
          dataDir: DATA_DIR,
          uploadToMongo: UPLOAD_TO_MONGODB,
          delay: DELAY_BETWEEN_REQUESTS
        },
        onProgress: (progress) => {
          if (progress.processed % 5 === 0 || progress.processed === progress.total) {
            console.log(`Thread ${progress.threadId}: Processed ${progress.processed}/${progress.total} IPOs (${progress.percentage}%)`);
          }
        }
      };
      
      // Process IPOs using worker threads
      const results = await processInThreads(validIpos, workerScriptPath, threadOptions);
      
      // Log summary
      const successful = results.filter(r => r && r.success).length;
      const failed = results.filter(r => r && !r.success).length;
      
      console.log(`\nThreaded processing completed for year ${year}:`);
      console.log(`- Total IPOs: ${validIpos.length}`);
      console.log(`- Successfully processed: ${successful}`);
      console.log(`- Failed: ${failed}`);
      
      return results;
    } catch (error) {
      console.error('Error during threaded processing:', error);
      console.log('Falling back to serial processing...');
      
      // Fall back to traditional processing
      return processWithConcurrency(validIpos, year);
    }
  } else {
    // Use the traditional concurrent processing approach
    return processWithConcurrency(validIpos, year);
  }
}

/**
 * Process IPOs using the traditional concurrency approach (Promise-based)
 * @param {Array} ipos - Array of IPO listings
 * @param {string} year - Year for organization
 */
async function processWithConcurrency(ipos, year) {
  const results = [];
  const pendingIpos = [...ipos];
  
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
  console.log(`MongoDB upload is ${UPLOAD_TO_MONGODB ? 'enabled' : 'disabled'}`);
  console.log(`Threaded processing is ${USE_THREADS ? 'enabled' : 'disabled'}`);
  
  try {
    // Ensure data directory exists
    await ensureDirectoryExists(DATA_DIR);
    
    // Process years using threads if multi-year range and threads are enabled
    if (USE_THREADS && endYear > startYear) {
      console.log('Using threads for multi-year processing');
      
      // Create array of years to process
      const years = Array.from({ length: endYear - startYear + 1 }, (_, i) => startYear + i);
      
      // Define worker script path for year processing
      const workerScriptPath = path.join(__dirname, '..', 'workers', 'ipoListingWorker.js');
      
      // Process years in parallel using threads
      const yearResults = await processInThreads(years, workerScriptPath, {
        maxThreads: Math.min(years.length, THREAD_COUNT),
        workerData: {
          dataDir: DATA_DIR,
          uploadToMongo: UPLOAD_TO_MONGODB,
          force: false
        }
      });
      
      // Process IPO details for each year's listings
      for (const yearResult of yearResults) {
        if (yearResult.success && yearResult.listings && yearResult.listings.length > 0) {
          console.log(`\nProcessing details for ${yearResult.count} IPOs from year ${yearResult.year}`);
          await processBatch(yearResult.listings, yearResult.year.toString());
        }
      }
    } else {
      // Process each year sequentially (better for single year requests)
      for (let year = startYear; year <= endYear; year++) {
        console.log(`\n--- Processing Year: ${year} ---`);
        
        // Fetch IPO listings for the year
        const ipoListings = await fetchIpoListings(year);
        
        if (!ipoListings || ipoListings.length === 0) {
          console.log(`No IPO listings found for year ${year}`);
          continue;
        }
        
        console.log(`Found ${ipoListings.length} IPO listings for year ${year}`);
        
        // Save listings summary to file
        const listingsDir = path.join(DATA_DIR, year.toString());
        await saveToJson(listingsDir, '_listings.json', ipoListings);
        
        // Upload listings to MongoDB if enabled
        if (UPLOAD_TO_MONGODB) {
          try {
            await uploadIpoListings(ipoListings, year.toString());
            console.log(`Uploaded IPO listings for year ${year} to MongoDB`);
          } catch (mongoError) {
            console.error(`MongoDB upload error for year ${year} listings:`, mongoError.message);
          }
        }
        
        // Process all IPOs for this year
        await processBatch(ipoListings, year.toString());
      }
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
    overwrite: false,
    uploadToMongo: UPLOAD_TO_MONGODB,
    useThreads: USE_THREADS,
    threadCount: THREAD_COUNT
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
    else if (arg === '--thread-count' && i + 1 < args.length) {
      const threadCount = parseInt(args[++i], 10);
      if (!isNaN(threadCount) && threadCount > 0) {
        options.threadCount = threadCount;
        process.env.THREAD_COUNT = threadCount.toString();
      }
    }
    else if (arg === '--overwrite') {
      options.overwrite = true;
    }
    else if (arg === '--no-mongo') {
      options.uploadToMongo = false;
      process.env.UPLOAD_TO_MONGODB = 'false';
    }
    else if (arg === '--mongo') {
      options.uploadToMongo = true;
      process.env.UPLOAD_TO_MONGODB = 'true';
    }
    else if (arg === '--use-threads') {
      options.useThreads = true;
      process.env.USE_THREADS = 'true';
    }
    else if (arg === '--no-threads') {
      options.useThreads = false;
      process.env.USE_THREADS = 'false';
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