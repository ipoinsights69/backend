const cron = require('node-cron');
const { scrapeIposByYearRange } = require('./scrapeIpos');
const { uploadIpoData } = require('./uploadToMongo');
const path = require('path');
const fs = require('fs').promises;
require('dotenv').config();

// Base directory for cron configuration
const CONFIG_DIR = process.env.CONFIG_DIR || path.join(__dirname, '..', 'config');
const CRON_CONFIG_FILE = path.join(CONFIG_DIR, 'cron-config.json');

/**
 * Loads cron configuration from file
 * @returns {Promise<Object>} - Configuration object
 */
async function loadCronConfig() {
  try {
    await fs.access(CONFIG_DIR);
  } catch (error) {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
  }

  try {
    await fs.access(CRON_CONFIG_FILE);
    const content = await fs.readFile(CRON_CONFIG_FILE, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    // Default configuration if file doesn't exist
    const defaultConfig = {
      jobs: [
        {
          id: 'daily-current-year',
          schedule: '0 0 * * *', // Daily at midnight
          task: 'scrape-and-upload',
          enabled: false,
          options: {
            year: new Date().getFullYear(),
            concurrency: 2,
            saveToMongo: true,
            overwrite: false
          }
        }
      ]
    };
    
    await fs.writeFile(CRON_CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
    return defaultConfig;
  }
}

/**
 * Saves cron configuration to file
 * @param {Object} config - Configuration object
 */
async function saveCronConfig(config) {
  await fs.writeFile(CRON_CONFIG_FILE, JSON.stringify(config, null, 2));
  console.log('Cron configuration saved successfully');
}

/**
 * Scrapes and uploads IPO data for a specific year
 * @param {number} year - Year to scrape
 * @param {Object} options - Options for scraping and uploading
 */
async function scrapeAndUploadForYear(year, options = {}) {
  const {
    concurrency = 2,
    saveToMongo = true,
    overwrite = false,
    logFile = null
  } = options;
  
  const timestamp = new Date().toISOString();
  
  console.log(`[${timestamp}] Starting scrape and upload for year ${year} with smart updates`);
  
  // Optional logging to file
  if (logFile) {
    const logDir = path.dirname(logFile);
    await fs.mkdir(logDir, { recursive: true });
    await fs.appendFile(logFile, `\n[${timestamp}] Starting scrape and upload for year ${year} with smart updates\n`);
  }
  
  try {
    // Set the MAX_CONCURRENT_REQUESTS in the environment
    process.env.MAX_CONCURRENT_REQUESTS = concurrency.toString();
    
    // Scrape IPO data
    console.log(`[${timestamp}] Scraping IPO data for year ${year} with concurrency ${concurrency}`);
    await scrapeIposByYearRange(year, year, saveToMongo);
    
    // If we're not directly saving to MongoDB during scrape, do it separately
    if (!saveToMongo) {
      console.log(`[${timestamp}] Uploading scraped data to MongoDB with selective updates`);
      await uploadIpoData(year, year, { overwrite });
    }
    
    console.log(`[${timestamp}] Completed scrape and upload for year ${year}`);
    if (logFile) {
      await fs.appendFile(logFile, `[${timestamp}] Completed scrape and upload for year ${year}\n`);
    }
  } catch (error) {
    console.error(`[${timestamp}] Error during scrape and upload:`, error);
    if (logFile) {
      await fs.appendFile(logFile, `[${timestamp}] ERROR: ${error.message}\n`);
    }
  }
}

/**
 * Add a new cron job to the configuration
 * @param {Object} jobConfig - Job configuration
 */
async function addCronJob(jobConfig) {
  const config = await loadCronConfig();
  
  // Check if job with this ID already exists
  const existingIndex = config.jobs.findIndex(job => job.id === jobConfig.id);
  
  if (existingIndex >= 0) {
    config.jobs[existingIndex] = { ...config.jobs[existingIndex], ...jobConfig };
  } else {
    config.jobs.push(jobConfig);
  }
  
  await saveCronConfig(config);
  return config;
}

/**
 * Remove a cron job from the configuration
 * @param {string} jobId - Job ID to remove
 */
async function removeCronJob(jobId) {
  const config = await loadCronConfig();
  config.jobs = config.jobs.filter(job => job.id !== jobId);
  await saveCronConfig(config);
  return config;
}

/**
 * Enable or disable a cron job
 * @param {string} jobId - Job ID to enable/disable
 * @param {boolean} enabled - Whether to enable or disable
 */
async function toggleCronJob(jobId, enabled) {
  const config = await loadCronConfig();
  const job = config.jobs.find(job => job.id === jobId);
  
  if (job) {
    job.enabled = enabled;
    await saveCronConfig(config);
  }
  
  return config;
}

/**
 * List all cron jobs
 */
async function listCronJobs() {
  const config = await loadCronConfig();
  return config.jobs;
}

// Map to store active cron jobs
const activeCronJobs = new Map();

/**
 * Start all enabled cron jobs
 */
async function startCronJobs() {
  const config = await loadCronConfig();
  
  // Stop any existing jobs
  stopCronJobs();
  
  // Start enabled jobs
  config.jobs.forEach(job => {
    if (job.enabled) {
      console.log(`Starting cron job: ${job.id}`);
      
      const task = cron.schedule(job.schedule, async () => {
        console.log(`Executing cron job: ${job.id}`);
        
        switch (job.task) {
          case 'scrape-and-upload':
            await scrapeAndUploadForYear(
              job.options.year || new Date().getFullYear(),
              {
                concurrency: job.options.concurrency || 2,
                saveToMongo: job.options.saveToMongo !== false,
                overwrite: job.options.overwrite === true,
                logFile: job.options.logFile || path.join(__dirname, '..', 'logs', `cron-${job.id}.log`)
              }
            );
            break;
            
          case 'upload-only':
            await uploadIpoData(
              job.options.year || new Date().getFullYear(),
              job.options.year || new Date().getFullYear(),
              {
                overwrite: job.options.overwrite === true,
                batchSize: job.options.batchSize || 10
              }
            );
            break;
            
          default:
            console.error(`Unknown task type: ${job.task}`);
        }
      });
      
      activeCronJobs.set(job.id, task);
    }
  });
  
  console.log(`Started ${activeCronJobs.size} cron jobs`);
}

/**
 * Stop all running cron jobs
 */
function stopCronJobs() {
  activeCronJobs.forEach((task, id) => {
    console.log(`Stopping cron job: ${id}`);
    task.stop();
  });
  
  activeCronJobs.clear();
  console.log('All cron jobs stopped');
}

// Handle command line arguments for direct execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  
  (async () => {
    try {
      switch (command) {
        case 'start':
          await startCronJobs();
          console.log('Cron jobs started. Press Ctrl+C to exit.');
          // Keep process running
          process.stdin.resume();
          break;
          
        case 'stop':
          stopCronJobs();
          process.exit(0);
          break;
          
        case 'list':
          const jobs = await listCronJobs();
          console.table(jobs.map(job => ({
            ID: job.id,
            Schedule: job.schedule,
            Task: job.task,
            Enabled: job.enabled,
            Year: job.options.year || 'current',
            Concurrency: job.options.concurrency || 2
          })));
          process.exit(0);
          break;
          
        case 'add':
          if (args.length < 5) {
            console.error('Usage: node cronManager.js add JOB_ID "CRON_SCHEDULE" TASK YEAR [CONCURRENCY]');
            console.error('Example: node cronManager.js add daily-2023 "0 0 * * *" scrape-and-upload 2023 3');
            process.exit(1);
          }
          
          const jobId = args[1];
          const schedule = args[2];
          const task = args[3];
          const year = parseInt(args[4], 10);
          const concurrency = parseInt(args[5] || '2', 10);
          
          await addCronJob({
            id: jobId,
            schedule,
            task,
            enabled: false, // Disabled by default
            options: {
              year,
              concurrency,
              saveToMongo: true,
              overwrite: false
            }
          });
          
          console.log(`Job '${jobId}' added. Use 'enable' command to activate it.`);
          process.exit(0);
          break;
          
        case 'remove':
          if (args.length < 2) {
            console.error('Usage: node cronManager.js remove JOB_ID');
            process.exit(1);
          }
          
          await removeCronJob(args[1]);
          console.log(`Job '${args[1]}' removed.`);
          process.exit(0);
          break;
          
        case 'enable':
          if (args.length < 2) {
            console.error('Usage: node cronManager.js enable JOB_ID');
            process.exit(1);
          }
          
          await toggleCronJob(args[1], true);
          console.log(`Job '${args[1]}' enabled.`);
          process.exit(0);
          break;
          
        case 'disable':
          if (args.length < 2) {
            console.error('Usage: node cronManager.js disable JOB_ID');
            process.exit(1);
          }
          
          await toggleCronJob(args[1], false);
          console.log(`Job '${args[1]}' disabled.`);
          process.exit(0);
          break;
          
        case 'run-now':
          if (args.length < 2) {
            console.error('Usage: node cronManager.js run-now JOB_ID');
            process.exit(1);
          }
          
          const config = await loadCronConfig();
          const job = config.jobs.find(j => j.id === args[1]);
          
          if (!job) {
            console.error(`Job '${args[1]}' not found.`);
            process.exit(1);
          }
          
          if (job.task === 'scrape-and-upload') {
            await scrapeAndUploadForYear(
              job.options.year || new Date().getFullYear(),
              {
                concurrency: job.options.concurrency || 2,
                saveToMongo: job.options.saveToMongo !== false,
                overwrite: job.options.overwrite === true
              }
            );
          } else if (job.task === 'upload-only') {
            await uploadIpoData(
              job.options.year || new Date().getFullYear(),
              job.options.year || new Date().getFullYear(),
              {
                overwrite: job.options.overwrite === true,
                batchSize: job.options.batchSize || 10
              }
            );
          }
          
          console.log(`Job '${args[1]}' executed.`);
          process.exit(0);
          break;
          
        default:
          console.error('Available commands:');
          console.error('  start - Start all enabled cron jobs');
          console.error('  stop - Stop all running cron jobs');
          console.error('  list - List all configured cron jobs');
          console.error('  add JOB_ID "CRON_SCHEDULE" TASK YEAR [CONCURRENCY] - Add a new cron job');
          console.error('  remove JOB_ID - Remove a cron job');
          console.error('  enable JOB_ID - Enable a cron job');
          console.error('  disable JOB_ID - Disable a cron job');
          console.error('  run-now JOB_ID - Run a cron job immediately');
          process.exit(1);
      }
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  })();
}

module.exports = {
  scrapeAndUploadForYear,
  startCronJobs,
  stopCronJobs,
  listCronJobs,
  addCronJob,
  removeCronJob,
  toggleCronJob
}; 