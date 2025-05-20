const cron = require('node-cron');
const { scrapeIposByYearRange } = require('./scrapeIpos');
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
          task: 'scrape-current-year',
          enabled: false,
          options: {
            year: new Date().getFullYear(),
            concurrency: 2
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
 * Scrapes IPO data for a specific year
 * @param {number} year - Year to scrape
 * @param {Object} options - Options for scraping
 */
async function scrapeForYear(year, options = {}) {
  const {
    concurrency = 2,
    logFile = null,
    jobId = 'manual-job'
  } = options;
  
  await logMessage(`Starting optimized scrape for year ${year}`, 'INFO', jobId);
  
  // Optional logging to file
  if (logFile) {
    const logDir = path.dirname(logFile);
    await fs.mkdir(logDir, { recursive: true });
    await fs.appendFile(logFile, `\n[${new Date().toISOString()}] Starting scrape for year ${year}\n`);
  }
  
  try {
    // Set the MAX_CONCURRENT_REQUESTS in the environment
    process.env.MAX_CONCURRENT_REQUESTS = concurrency.toString();
    
    // Scrape IPO data
    await logMessage(`Scraping IPO data for year ${year} with optimized approach`, 'INFO', jobId);
    const { scrapeNewIpos } = require('./scrapeIpos');
    await scrapeNewIpos(year);
    
    await logMessage(`Completed scrape for year ${year}`, 'INFO', jobId);
    if (logFile) {
      await fs.appendFile(logFile, `[${new Date().toISOString()}] Completed scrape for year ${year}\n`);
    }
  } catch (error) {
    await logMessage(`Error during scrape: ${error.message}`, 'ERROR', jobId);
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
            case 'scrape-current-year':
              await scrapeForYear(
                new Date().getFullYear(),
                {
                  concurrency: job.options.concurrency || 2,
                  jobId: job.id
                }
              );
              break;
              
            case 'scrape-specific-year':
              await scrapeForYear(
                job.options.year || new Date().getFullYear(),
                {
                  concurrency: job.options.concurrency || 2,
                  jobId: job.id
                }
              );
              break;
              
            default:
              await logMessage(`Unknown task type: ${job.task}`, 'ERROR', job.id);
          }
          
          const endTime = new Date();
          const duration = (endTime - startTime) / 1000;
          await logMessage(`Completed job: ${job.id} in ${duration.toFixed(2)} seconds`, 'INFO', job.id);
        });
        
        // Store the task
        activeCronJobs.set(job.id, task);
        await logMessage(`Started cron job: ${job.id}`);
      } catch (error) {
        await logMessage(`Failed to start cron job ${job.id}: ${error.message}`, 'ERROR');
      }
    }
  }
  
  return {
    count: activeCronJobs.size,
    activeJobs: Array.from(activeCronJobs.keys())
  };
}

/**
 * Get the next execution time for a cron expression
 * @param {string} cronExpression - Cron expression
 * @returns {Date} - Next execution time
 */
function getNextExecutionTime(cronExpression) {
  try {
    return cron.schedule(cronExpression).nextDate().toDate();
  } catch (error) {
    console.error(`Invalid cron expression: ${cronExpression}`);
    return null;
  }
}

/**
 * Stop all running cron jobs
 */
async function stopCronJobs() {
  for (const [jobId, task] of activeCronJobs.entries()) {
    task.stop();
    await logMessage(`Stopped cron job: ${jobId}`);
  }
  
  activeCronJobs.clear();
}

/**
 * Test a cron job by validating its configuration and next execution time
 * @param {string} jobId - Job ID to test
 */
async function testCronJob(jobId) {
  const config = await loadCronConfig();
  const job = config.jobs.find(job => job.id === jobId);
  
  if (!job) {
    return {
      success: false,
      error: `Job not found: ${jobId}`
    };
  }
  
  if (!cron.validate(job.schedule)) {
    return {
      success: false,
      error: `Invalid cron schedule: ${job.schedule}`
    };
  }
  
  const nextExecution = getNextExecutionTime(job.schedule);
  
  if (!nextExecution) {
    return {
      success: false,
      error: 'Failed to calculate next execution time'
    };
  }
  
  return {
    success: true,
    id: job.id,
    schedule: job.schedule,
    task: job.task,
    enabled: job.enabled,
    options: job.options,
    nextExecution: nextExecution.toISOString()
  };
}

/**
 * Run a specific job immediately
 * @param {string} jobId - Job ID to run
 */
async function runJobNow(jobId) {
  const config = await loadCronConfig();
  const job = config.jobs.find(job => job.id === jobId);
  
  if (!job) {
    await logMessage(`Job not found: ${jobId}`, 'ERROR');
    return {
      success: false,
      error: `Job not found: ${jobId}`
    };
  }
  
  await logMessage(`Running job immediately: ${jobId}`, 'INFO', jobId);
  
  try {
    switch (job.task) {
      case 'scrape-current-year':
        await scrapeForYear(
          new Date().getFullYear(),
          {
            concurrency: job.options.concurrency || 2,
            jobId: job.id
          }
        );
        break;
        
      case 'scrape-specific-year':
        await scrapeForYear(
          job.options.year || new Date().getFullYear(),
          {
            concurrency: job.options.concurrency || 2,
            jobId: job.id
          }
        );
        break;
        
      default:
        await logMessage(`Unknown task type: ${job.task}`, 'ERROR', jobId);
        return {
          success: false,
          error: `Unknown task type: ${job.task}`
        };
    }
    
    await logMessage(`Completed manual run of job: ${jobId}`, 'INFO', jobId);
    return {
      success: true,
      message: `Job ${jobId} completed successfully`
    };
  } catch (error) {
    await logMessage(`Error running job ${jobId}: ${error.message}`, 'ERROR', jobId);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Execute a task with the given configuration
 * @param {string} taskType - Type of task to execute
 * @param {Object} options - Task-specific options
 * @param {string} jobId - Job ID
 * @returns {Promise<boolean>} - Success indicator
 */
async function executeTask(taskType, options, jobId) {
  const logFile = path.join(CRON_LOG_DIR, `job-${jobId}-${new Date().toISOString().split('T')[0]}.log`);
  
  await logMessage(`Executing task: ${taskType} with options: ${JSON.stringify(options)}`, 'INFO', jobId);
  
  try {
    // Set threading options in environment if specified
    if (options.useThreads !== undefined) {
      process.env.USE_THREADS = options.useThreads ? 'true' : 'false';
      await logMessage(`Thread processing is ${options.useThreads ? 'enabled' : 'disabled'}`, 'INFO', jobId);
    }
    
    if (options.threadCount !== undefined && options.threadCount > 0) {
      process.env.THREAD_COUNT = options.threadCount.toString();
      await logMessage(`Thread count set to ${options.threadCount}`, 'INFO', jobId);
    }
    
    switch (taskType) {
      case 'scrape-current-year':
        const year = options.year || new Date().getFullYear();
        await scrapeForYear(year, { 
          concurrency: options.concurrency || 2, 
          logFile,
          jobId,
          useThreads: options.useThreads || false,
          threadCount: options.threadCount || 4
        });
        return true;
      case 'scrape-year-range':
        const startYear = options.startYear || options.year || new Date().getFullYear();
        const endYear = options.endYear || startYear;
        
        await logMessage(`Scraping year range: ${startYear}-${endYear}`, 'INFO', jobId);
        await scrapeIposByYearRange(startYear, endYear);
        return true;
      // Add more task types as needed
      default:
        await logMessage(`Unknown task type: ${taskType}`, 'ERROR', jobId);
        return false;
    }
  } catch (error) {
    await logMessage(`Error executing task: ${error.message}`, 'ERROR', jobId);
    return false;
  }
}

/**
 * Run a cron job
 * @param {Object} job - Job configuration
 * @param {boolean} [isManual=false] - Whether the job is being run manually
 */
async function runJob(job, isManual = false) {
  // Skip disabled jobs unless run manually
  if (!job.enabled && !isManual) {
    await logMessage(`Skipping disabled job: ${job.id}`, 'INFO', job.id);
    return false;
  }
  
  await logMessage(`Running job: ${job.id} (${isManual ? 'manual trigger' : 'scheduled'})`, 'INFO', job.id);
  
  try {
    // Execute the task based on task type
    const success = await executeTask(job.task, job.options || {}, job.id);
    
    if (success) {
      await logMessage(`Job ${job.id} completed successfully`, 'INFO', job.id);
    } else {
      await logMessage(`Job ${job.id} failed`, 'ERROR', job.id);
    }
    
    return success;
  } catch (error) {
    await logMessage(`Error running job ${job.id}: ${error.message}`, 'ERROR', job.id);
    return false;
  }
}

// Handle direct execution for CLI commands
if (require.main === module) {
  const [command, ...args] = process.argv.slice(2);
  
  (async () => {
    try {
      switch (command) {
        case 'list':
          const jobs = await listCronJobs();
          console.log('\nConfigured Cron Jobs:');
          console.log('---------------------');
          jobs.forEach(job => {
            const nextRun = job.enabled ? getNextExecutionTime(job.schedule) : null;
            console.log(`ID: ${job.id}`);
            console.log(`Schedule: ${job.schedule}`);
            console.log(`Task: ${job.task}`);
            console.log(`Enabled: ${job.enabled ? 'Yes' : 'No'}`);
            if (nextRun) {
              console.log(`Next Run: ${nextRun.toLocaleString()}`);
            }
            console.log('---------------------');
          });
          break;
          
        case 'start':
          const result = await startCronJobs();
          console.log(`\nStarted ${result.count} cron job(s)`);
          console.log(`Active jobs: ${result.activeJobs.join(', ') || 'None'}`);
          console.log('\nPress Ctrl+C to exit');
          // Keep process alive for the cron jobs
          setInterval(() => {}, 1000);
          break;
          
        case 'stop':
          await stopCronJobs();
          console.log('\nAll cron jobs stopped');
          break;
          
        case 'add':
          if (args.length < 3) {
            console.log('\nUsage: node cronManager.js add <id> <schedule> <task>');
            console.log('Example: node cronManager.js add nightly-scrape "0 0 * * *" scrape-current-year');
            break;
          }
          
          const [jobId, schedule, jobTask] = args;
          
          // Basic validation
          if (!cron.validate(schedule)) {
            console.error(`\nInvalid cron schedule: ${schedule}`);
            break;
          }
          
          // Add the job
          await addCronJob({
            id: jobId,
            schedule,
            task: jobTask,
            enabled: false,
            options: {
              year: new Date().getFullYear(),
              concurrency: 2
            }
          });
          
          console.log(`\nAdded job: ${jobId}`);
          console.log('Job is disabled by default. Enable with:');
          console.log(`node cronManager.js enable ${jobId}`);
          break;
          
        case 'remove':
          if (args.length < 1) {
            console.log('\nUsage: node cronManager.js remove <id>');
            break;
          }
          
          await removeCronJob(args[0]);
          console.log(`\nRemoved job: ${args[0]}`);
          break;
          
        case 'enable':
          if (args.length < 1) {
            console.log('\nUsage: node cronManager.js enable <id>');
            break;
          }
          
          await toggleCronJob(args[0], true);
          console.log(`\nEnabled job: ${args[0]}`);
          break;
          
        case 'disable':
          if (args.length < 1) {
            console.log('\nUsage: node cronManager.js disable <id>');
            break;
          }
          
          await toggleCronJob(args[0], false);
          console.log(`\nDisabled job: ${args[0]}`);
          break;
          
        case 'test':
          if (args.length < 1) {
            console.log('\nUsage: node cronManager.js test <id>');
            break;
          }
          
          const testResult = await testCronJob(args[0]);
          
          if (testResult.success) {
            console.log(`\nJob ${args[0]} is valid:`);
            console.log(`Schedule: ${testResult.schedule}`);
            console.log(`Next execution: ${new Date(testResult.nextExecution).toLocaleString()}`);
          } else {
            console.error(`\nJob test failed: ${testResult.error}`);
          }
          break;
          
        case 'run-now':
          if (args.length < 1) {
            console.log('\nUsage: node cronManager.js run-now <id>');
            break;
          }
          
          console.log(`\nRunning job ${args[0]} now...`);
          const runResult = await runJobNow(args[0]);
          
          if (runResult.success) {
            console.log(`Job completed successfully!`);
          } else {
            console.error(`Job execution failed: ${runResult.error}`);
          }
          break;
          
        case 'status':
          console.log('\nCron System Status:');
          console.log('------------------');
          
          const jobsList = await listCronJobs();
          const enabledJobs = jobsList.filter(job => job.enabled);
          
          console.log(`Total Jobs: ${jobsList.length}`);
          console.log(`Enabled Jobs: ${enabledJobs.length}`);
          console.log(`Active Jobs: ${activeCronJobs.size} (may be 0 if cron system not started)`);
          
          if (enabledJobs.length > 0) {
            console.log('\nEnabled Jobs:');
            enabledJobs.forEach(job => {
              const nextRun = getNextExecutionTime(job.schedule);
              console.log(`- ${job.id} (${job.task}): Next run at ${nextRun ? nextRun.toLocaleString() : 'Unknown'}`);
            });
          }
          break;
          
        default:
          console.log('\nUsage:');
          console.log('node cronManager.js list - List all configured jobs');
          console.log('node cronManager.js start - Start all enabled jobs');
          console.log('node cronManager.js stop - Stop all running jobs');
          console.log('node cronManager.js add <id> <schedule> <task> - Add a new job');
          console.log('node cronManager.js remove <id> - Remove a job');
          console.log('node cronManager.js enable <id> - Enable a job');
          console.log('node cronManager.js disable <id> - Disable a job');
          console.log('node cronManager.js test <id> - Test job configuration');
          console.log('node cronManager.js run-now <id> - Run a job immediately');
          console.log('node cronManager.js status - Show cron system status');
          break;
      }
    } catch (error) {
      console.error(`\nError: ${error.message}`);
      process.exit(1);
    }
  })();
}

module.exports = {
  addCronJob,
  removeCronJob,
  toggleCronJob,
  startCronJobs,
  stopCronJobs,
  listCronJobs,
  testCronJob,
  runJobNow,
  getNextExecutionTime
}; 