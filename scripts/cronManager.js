const cron = require('node-cron');
const { scrapeIposByYearRange } = require('./scrapeIpos');
const { uploadIpoData } = require('./uploadToMongo');
const path = require('path');
const fs = require('fs').promises;
require('dotenv').config();

// Base directory for cron configuration
const CONFIG_DIR = process.env.CONFIG_DIR || path.join(__dirname, '..', 'config');
const CRON_CONFIG_FILE = path.join(CONFIG_DIR, 'cron-config.json');
const CRON_LOG_DIR = process.env.CRON_LOG_DIR || path.join(__dirname, '..', 'logs');

/**
 * Ensure log directory exists
 */
async function ensureLogDir() {
  try {
    await fs.access(CRON_LOG_DIR);
  } catch (error) {
    await fs.mkdir(CRON_LOG_DIR, { recursive: true });
    console.log(`Created log directory: ${CRON_LOG_DIR}`);
  }
}

/**
 * Log a message to console and file
 * @param {string} message - Message to log
 * @param {string} [level='INFO'] - Log level
 * @param {string} [jobId=null] - Job ID for context
 */
async function logMessage(message, level = 'INFO', jobId = null) {
  const timestamp = new Date().toISOString();
  const logPrefix = jobId ? `[${timestamp}] [${level}] [${jobId}]` : `[${timestamp}] [${level}]`;
  const fullMessage = `${logPrefix} ${message}`;
  
  // Log to console
  if (level === 'ERROR') {
    console.error(fullMessage);
  } else {
    console.log(fullMessage);
  }
  
  // Log to file
  try {
    await ensureLogDir();
    const logFile = path.join(CRON_LOG_DIR, 'cron.log');
    await fs.appendFile(logFile, fullMessage + '\n');
    
    // Also log to job-specific file if jobId is provided
    if (jobId) {
      const jobLogFile = path.join(CRON_LOG_DIR, `job-${jobId}.log`);
      await fs.appendFile(jobLogFile, fullMessage + '\n');
    }
  } catch (error) {
    console.error(`Failed to write to log file: ${error.message}`);
  }
}

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
  await logMessage('Cron configuration saved successfully');
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
    logFile = null,
    jobId = 'manual-job'
  } = options;
  
  await logMessage(`Starting scrape and upload for year ${year} with smart updates`, 'INFO', jobId);
  
  // Optional logging to file
  if (logFile) {
    const logDir = path.dirname(logFile);
    await fs.mkdir(logDir, { recursive: true });
    await fs.appendFile(logFile, `\n[${new Date().toISOString()}] Starting scrape and upload for year ${year} with smart updates\n`);
  }
  
  try {
    // Set the MAX_CONCURRENT_REQUESTS in the environment
    process.env.MAX_CONCURRENT_REQUESTS = concurrency.toString();
    
    // Scrape IPO data
    await logMessage(`Scraping IPO data for year ${year} with concurrency ${concurrency}`, 'INFO', jobId);
    await scrapeIposByYearRange(year, year, saveToMongo);
    
    // If we're not directly saving to MongoDB during scrape, do it separately
    if (!saveToMongo) {
      await logMessage(`Uploading scraped data to MongoDB with selective updates`, 'INFO', jobId);
      await uploadIpoData(year, year, { overwrite });
    }
    
    await logMessage(`Completed scrape and upload for year ${year}`, 'INFO', jobId);
    if (logFile) {
      await fs.appendFile(logFile, `[${new Date().toISOString()}] Completed scrape and upload for year ${year}\n`);
    }
  } catch (error) {
    await logMessage(`Error during scrape and upload: ${error.message}`, 'ERROR', jobId);
    if (logFile) {
      await fs.appendFile(logFile, `[${new Date().toISOString()}] ERROR: ${error.message}\n`);
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
    await logMessage(`Updated existing cron job: ${jobConfig.id}`);
  } else {
    config.jobs.push(jobConfig);
    await logMessage(`Added new cron job: ${jobConfig.id}`);
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
  await logMessage(`Removed cron job: ${jobId}`);
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
    await logMessage(`${enabled ? 'Enabled' : 'Disabled'} cron job: ${jobId}`);
  } else {
    await logMessage(`Job not found: ${jobId}`, 'ERROR');
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
  await logMessage('Starting cron system...');
  const config = await loadCronConfig();
  
  // Stop any existing jobs
  stopCronJobs();
  
  // Start enabled jobs
  for (const job of config.jobs) {
    if (job.enabled) {
      await logMessage(`Setting up cron job: ${job.id} with schedule: ${job.schedule}`);
      
      try {
        // Validate cron schedule
        if (!cron.validate(job.schedule)) {
          await logMessage(`Invalid cron schedule for job ${job.id}: ${job.schedule}`, 'ERROR');
          continue;
        }
        
        const task = cron.schedule(job.schedule, async () => {
          const startTime = new Date();
          await logMessage(`Executing cron job: ${job.id} at ${startTime.toISOString()}`, 'INFO', job.id);
          
          switch (job.task) {
            case 'scrape-and-upload':
              await scrapeAndUploadForYear(
                job.options.year || new Date().getFullYear(),
                {
                  concurrency: job.options.concurrency || 2,
                  saveToMongo: job.options.saveToMongo !== false,
                  overwrite: job.options.overwrite === true,
                  logFile: job.options.logFile || path.join(CRON_LOG_DIR, `cron-${job.id}.log`),
                  jobId: job.id
                }
              );
              break;
              
            case 'upload-only':
              await logMessage(`Running upload-only task for year ${job.options.year || new Date().getFullYear()}`, 'INFO', job.id);
              await uploadIpoData(
                job.options.year || new Date().getFullYear(),
                job.options.year || new Date().getFullYear(),
                {
                  overwrite: job.options.overwrite === true,
                  batchSize: job.options.batchSize || 10
                }
              );
              await logMessage(`Upload-only task completed`, 'INFO', job.id);
              break;
              
            default:
              await logMessage(`Unknown task type: ${job.task}`, 'ERROR', job.id);
          }
          
          const endTime = new Date();
          const executionTime = (endTime - startTime) / 1000;
          await logMessage(`Cron job ${job.id} completed in ${executionTime.toFixed(2)} seconds`, 'INFO', job.id);
        }, {
          scheduled: true,
          timezone: process.env.CRON_TIMEZONE || 'UTC'
        });
        
        task.start();
        activeCronJobs.set(job.id, task);
        await logMessage(`Cron job started: ${job.id}`);
        
        // For verification, calculate and log next execution time
        const nextDate = getNextExecutionTime(job.schedule);
        await logMessage(`Next execution time for ${job.id}: ${nextDate.toISOString()}`);
      } catch (error) {
        await logMessage(`Error starting cron job ${job.id}: ${error.message}`, 'ERROR');
      }
    }
  }
  
  await logMessage(`Started ${activeCronJobs.size} cron jobs`);
  
  // Return information about active jobs for verification
  return {
    activeJobs: Array.from(activeCronJobs.keys()),
    count: activeCronJobs.size
  };
}

/**
 * Calculate the next execution time for a cron schedule
 * @param {string} cronExpression - Cron expression
 * @returns {Date} - Next execution date
 */
function getNextExecutionTime(cronExpression) {
  try {
    // Use node-cron's internal parser
    const task = cron.schedule(cronExpression, () => {});
    const nextDate = new Date(task.nextDate().valueOf());
    task.stop();
    return nextDate;
  } catch (error) {
    console.error(`Error calculating next execution time: ${error.message}`);
    return new Date(Date.now() + 86400000); // Return tomorrow as fallback
  }
}

/**
 * Stop all running cron jobs
 */
async function stopCronJobs() {
  for (const [id, task] of activeCronJobs.entries()) {
    await logMessage(`Stopping cron job: ${id}`);
    task.stop();
  }
  
  activeCronJobs.clear();
  await logMessage('All cron jobs stopped');
}

// Test the cron job system and report status
async function testCronJob(jobId) {
  const config = await loadCronConfig();
  const job = config.jobs.find(j => j.id === jobId);
  
  if (!job) {
    await logMessage(`Job '${jobId}' not found for testing`, 'ERROR');
    return { success: false, error: 'Job not found' };
  }
  
  try {
    // Validate the cron schedule
    if (!cron.validate(job.schedule)) {
      await logMessage(`Invalid cron schedule: ${job.schedule}`, 'ERROR');
      return { success: false, error: 'Invalid cron schedule' };
    }
    
    // Calculate next execution time
    const nextExecutionTime = getNextExecutionTime(job.schedule);
    
    // Log job details
    await logMessage(`Cron job ${jobId} schedule: ${job.schedule}`, 'INFO');
    await logMessage(`Cron job ${jobId} next execution: ${nextExecutionTime.toISOString()}`, 'INFO');
    
    return {
      success: true,
      jobId: jobId,
      enabled: job.enabled,
      schedule: job.schedule,
      task: job.task,
      nextExecution: nextExecutionTime.toISOString(),
      options: job.options
    };
  } catch (error) {
    await logMessage(`Error testing cron job ${jobId}: ${error.message}`, 'ERROR');
    return { success: false, error: error.message };
  }
}

// Handle command line arguments for direct execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  
  (async () => {
    try {
      switch (command) {
        case 'start':
          const result = await startCronJobs();
          console.log('Cron jobs started:', result);
          console.log('Cron system is now running. Press Ctrl+C to exit.');
          // Keep process running
          process.stdin.resume();
          break;
          
        case 'stop':
          await stopCronJobs();
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
          
          console.log(`Executing job '${args[1]}' immediately...`);
          
          if (job.task === 'scrape-and-upload') {
            await scrapeAndUploadForYear(
              job.options.year || new Date().getFullYear(),
              {
                concurrency: job.options.concurrency || 2,
                saveToMongo: job.options.saveToMongo !== false,
                overwrite: job.options.overwrite === true,
                jobId: job.id
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
          
        case 'test':
          if (args.length < 2) {
            console.error('Usage: node cronManager.js test JOB_ID');
            process.exit(1);
          }
          
          const testResult = await testCronJob(args[1]);
          console.log('Cron job test result:', JSON.stringify(testResult, null, 2));
          process.exit(0);
          break;
          
        case 'status':
          const statusConfig = await loadCronConfig();
          console.log('\nCron Jobs Configuration Status:');
          console.table(statusConfig.jobs.map(job => ({
            ID: job.id,
            Enabled: job.enabled ? '✅' : '❌',
            Schedule: job.schedule,
            Task: job.task,
            Year: job.options.year || new Date().getFullYear(),
            NextRun: job.enabled ? getNextExecutionTime(job.schedule).toLocaleString() : 'Disabled'
          })));
          
          console.log('\nActive Cron Jobs:', activeCronJobs.size);
          if (activeCronJobs.size > 0) {
            console.log('Active Job IDs:', Array.from(activeCronJobs.keys()).join(', '));
          }
          
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
          console.error('  test JOB_ID - Test a cron job configuration');
          console.error('  status - Show current cron job status');
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
  toggleCronJob,
  testCronJob,
  getNextExecutionTime,
  logMessage
}; 