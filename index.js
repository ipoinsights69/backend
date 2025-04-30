/**
 * IPO Scraper
 * Main entry point
 */

// Load environment variables
require('dotenv').config();

// Check command-line arguments
const args = process.argv.slice(2);
const command = args[0] || 'scrape-current';

// Parse MongoDB options
const mongoArg = args.includes('--mongo') ? '--mongo' : (args.includes('--no-mongo') ? '--no-mongo' : null);
// Parse threading options
const threadArg = args.includes('--use-threads') ? '--use-threads' : (args.includes('--no-threads') ? '--no-threads' : null);

// Get thread count if specified
let threadCount = null;
const threadCountIndex = args.indexOf('--thread-count');
if (threadCountIndex !== -1 && threadCountIndex + 1 < args.length) {
  const count = parseInt(args[threadCountIndex + 1], 10);
  if (!isNaN(count) && count > 0) {
    threadCount = count;
  }
}

// Filter out processed arguments
const remainingArgs = args.filter(arg => 
  arg !== '--mongo' && 
  arg !== '--no-mongo' && 
  arg !== '--use-threads' && 
  arg !== '--no-threads' && 
  arg !== '--thread-count' && 
  (args.indexOf(arg) !== threadCountIndex + 1 || threadCountIndex === -1)
);

// Setup utility to start the cron system
async function ensureCronSystem() {
  try {
    // Only import if needed
    const { startCronJobs } = require('./scripts/cronManager');
    console.log('Starting cron system...');
    await startCronJobs();
    console.log('Cron system started successfully');
  } catch (error) {
    console.error('Failed to start cron system:', error);
  }
}

// Process command
switch (command) {
  case 'scrape-current':
    // Scrape current year IPO data
    const currentYear = new Date().getFullYear();
    
    console.log(`Starting scraper for current year (${currentYear})`);
    if (threadArg) {
      console.log(`Threading: ${threadArg === '--use-threads' ? 'Enabled' : 'Disabled'}`);
      if (threadCount) {
        console.log(`Thread count: ${threadCount}`);
      }
    }
    
    // Execute scraper directly for current year
    const { scrapeIposByYearRange } = require('./scripts/scrapeIpos');
    
    // Prepare arguments with optional MongoDB and threading flags
    const currentYearArgs = [currentYear, currentYear];
    if (mongoArg) {
      process.env.UPLOAD_TO_MONGODB = mongoArg === '--mongo' ? 'true' : 'false';
    }
    if (threadArg) {
      process.env.USE_THREADS = threadArg === '--use-threads' ? 'true' : 'false';
    }
    if (threadCount !== null) {
      process.env.THREAD_COUNT = threadCount.toString();
    }
    
    scrapeIposByYearRange(currentYear, currentYear)
      .then((success) => {
        console.log('Scraping process completed.');
        process.exit(success ? 0 : 1);
      })
      .catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
      });
    break;
    
  case 'scrape':
    // Run scraper with arguments
    // Remove command from remainingArgs to correctly access positional arguments
    const scrapeArgs = remainingArgs.filter(arg => arg !== 'scrape');
    
    // Parse start and end years, ensuring they are valid numbers
    const startYear = parseInt(scrapeArgs[0], 10);
    const endYear = parseInt(scrapeArgs[1] || scrapeArgs[0], 10); 
    
    // Validate year inputs
    if (isNaN(startYear)) {
      console.error('Error: Invalid start year. Please provide a valid year as a number.');
      process.exit(1);
    }
    
    console.log(`Starting scraper for years ${startYear}-${endYear}`);
    if (threadArg) {
      console.log(`Threading: ${threadArg === '--use-threads' ? 'Enabled' : 'Disabled'}`);
      if (threadCount) {
        console.log(`Thread count: ${threadCount}`);
      }
    }
    
    // Execute scraper directly with specific arguments
    const { scrapeIposByYearRange: scrapeWithRange } = require('./scripts/scrapeIpos');
    
    // Set environment variables for MongoDB and threading
    if (mongoArg) {
      process.env.UPLOAD_TO_MONGODB = mongoArg === '--mongo' ? 'true' : 'false';
    }
    if (threadArg) {
      process.env.USE_THREADS = threadArg === '--use-threads' ? 'true' : 'false';
    }
    if (threadCount !== null) {
      process.env.THREAD_COUNT = threadCount.toString();
    }
    
    scrapeWithRange(startYear, endYear)
      .then((success) => {
        console.log('Scraping process completed.');
        process.exit(success ? 0 : 1);
      })
      .catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
      });
    break;
    
  case 'cron-start':
    // Just start the cron system
    ensureCronSystem()
      .then(() => {
        console.log('Cron system initialized and running...');
        // Keep process alive
        console.log('Press Ctrl+C to exit');
        setInterval(() => {}, 1000);
      })
      .catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
      });
    break;
    
  case 'setup-daily-cron':
    // Setup daily cron job for scraping current year
    const { addCronJob, toggleCronJob } = require('./scripts/cronManager');
    
    // Create a daily job at midnight
    const dailyJob = {
      id: 'daily-ipo-update',
      schedule: '0 0 * * *', // Run at midnight (00:00) every day
      task: 'scrape-current-year',
      enabled: true,
      options: {
        year: new Date().getFullYear(), // Current year
        uploadToMongo: mongoArg === '--mongo', // Enable MongoDB upload if specified
        useThreads: threadArg === '--use-threads', // Enable threaded processing if specified
        threadCount: threadCount || 4 // Default to 4 threads if not specified
      }
    };
    
    addCronJob(dailyJob)
      .then(() => toggleCronJob(dailyJob.id, true))
      .then(() => {
        console.log('Daily cron job set up successfully to run at midnight.');
        console.log('MongoDB upload is ' + (dailyJob.options.uploadToMongo ? 'enabled' : 'disabled') + ' for this job.');
        console.log('Threaded processing is ' + (dailyJob.options.useThreads ? 'enabled' : 'disabled') + ' for this job.');
        if (dailyJob.options.useThreads) {
          console.log(`Thread count: ${dailyJob.options.threadCount}`);
        }
        console.log('Start the cron system with: node index.js cron-start');
        process.exit(0);
      })
      .catch((error) => {
        console.error('Failed to set up daily cron job:', error);
        process.exit(1);
      });
    break;
    
  default:
    console.error(`Unknown command: ${command}`);
    console.log('Available commands:');
    console.log('  - scrape-current: Scrape IPOs for current year');
    console.log('  - scrape [startYear] [endYear]: Scrape IPOs for specific year range');
    console.log('  - cron-start: Start the cron system');
    console.log('  - setup-daily-cron: Setup a daily midnight cron job for the current year');
    console.log('');
    console.log('Optional flags:');
    console.log('  --mongo: Enable MongoDB upload');
    console.log('  --no-mongo: Disable MongoDB upload');
    console.log('  --use-threads: Enable threaded processing');
    console.log('  --no-threads: Disable threaded processing');
    console.log('  --thread-count <number>: Set number of threads to use');
    process.exit(1);
} 