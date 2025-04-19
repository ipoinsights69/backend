/**
 * Cron Job Manager
 * Manages scheduled tasks for the IPO scraper application
 */
const cron = require('node-cron');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Store for cron jobs
const cronJobs = {};
// Store for single job runs
const singleJobs = {};

// Logging utility
const logToFile = (message, type = 'info') => {
  try {
    const logsDir = path.join(process.cwd(), 'logs');
    
    // Create logs directory if it doesn't exist
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    const date = new Date();
    const logFile = path.join(logsDir, `cron-${date.toISOString().split('T')[0]}.log`);
    const timestamp = date.toISOString();
    const logEntry = `[${timestamp}] [${type.toUpperCase()}] ${message}\n`;
    
    fs.appendFileSync(logFile, logEntry);
  } catch (error) {
    console.error('Failed to write to log file:', error);
  }
};

/**
 * Execute a command with arguments
 * @param {string} command - The command to execute
 * @param {Array} args - Command arguments
 * @param {Function} callback - Callback function
 */
const executeCommand = (command, args = [], callback = () => {}) => {
  const scriptPath = path.join(process.cwd(), 'scripts', `${command}.js`);
  
  // Check if script exists
  if (!fs.existsSync(scriptPath)) {
    const error = `Script not found: ${scriptPath}`;
    logToFile(error, 'error');
    return callback(new Error(error));
  }
  
  const cmd = `node ${scriptPath} ${args.join(' ')}`;
  logToFile(`Executing command: ${cmd}`);
  
  exec(cmd, (error, stdout, stderr) => {
    if (error) {
      logToFile(`Error executing command: ${error.message}`, 'error');
      return callback(error);
    }
    
    if (stderr) {
      logToFile(`Command stderr: ${stderr}`, 'warn');
    }
    
    logToFile(`Command completed: ${stdout.trim().substring(0, 500)}${stdout.length > 500 ? '...' : ''}`);
    callback(null, stdout);
  });
};

/**
 * Add or update a cron job
 * @param {string} name - Job name
 * @param {Object} config - Job configuration
 * @returns {Object} - Job status
 */
const addOrUpdateJob = (name, config) => {
  const { schedule, command, args = [], active = true } = config;
  
  // Validate cron expression
  if (!cron.validate(schedule)) {
    throw new Error(`Invalid cron schedule: ${schedule}`);
  }
  
  // Stop existing job if it exists
  let added = true;
  if (cronJobs[name]) {
    cronJobs[name].task.stop();
    added = false;
  }
  
  // Create job if active
  if (active) {
    const task = cron.schedule(schedule, () => {
      logToFile(`Running scheduled job: ${name}`);
      executeCommand(command, args, (error) => {
        if (error) {
          logToFile(`Job ${name} failed: ${error.message}`, 'error');
        } else {
          logToFile(`Job ${name} completed successfully`);
        }
      });
    });
    
    cronJobs[name] = {
      name,
      schedule,
      command,
      args,
      active,
      lastRun: null,
      nextRun: getNextRunTime(schedule),
      task
    };
    
    logToFile(`Job ${name} ${added ? 'added' : 'updated'} with schedule: ${schedule}`);
  } else {
    // Just store the configuration if inactive
    cronJobs[name] = {
      name,
      schedule,
      command,
      args,
      active: false,
      lastRun: null,
      nextRun: null,
      task: null
    };
    
    logToFile(`Job ${name} ${added ? 'added' : 'updated'} but is inactive`);
  }
  
  return { added, job: cronJobs[name] };
};

/**
 * Remove a cron job
 * @param {string} name - Job name
 * @returns {boolean} - Success status
 */
const removeJob = (name) => {
  if (!cronJobs[name]) {
    return false;
  }
  
  if (cronJobs[name].task) {
    cronJobs[name].task.stop();
  }
  
  delete cronJobs[name];
  logToFile(`Job ${name} removed`);
  
  return true;
};

/**
 * Get all cron jobs
 * @returns {Object} - All jobs
 */
const getAllJobs = () => {
  const result = {};
  
  for (const name in cronJobs) {
    // Create a clean copy without the task object
    result[name] = {
      ...cronJobs[name],
      task: cronJobs[name].task ? 'active' : null
    };
  }
  
  return result;
};

/**
 * Get status of all cron jobs and single jobs
 * @returns {Object} - Status object
 */
const getStatus = () => {
  return {
    cronJobs: Object.keys(cronJobs).length,
    activeCronJobs: Object.values(cronJobs).filter(job => job.active).length,
    singleJobs: Object.keys(singleJobs).length,
    activeSingleJobs: Object.values(singleJobs).filter(job => job.status === 'running').length,
    completedSingleJobs: Object.values(singleJobs).filter(job => job.status === 'completed').length,
    failedSingleJobs: Object.values(singleJobs).filter(job => job.status === 'failed').length
  };
};

/**
 * Schedule a single job run
 * @param {string} type - Job type
 * @param {Object} config - Job configuration
 * @returns {string} - Job ID
 */
const scheduleSingleJob = (type, config) => {
  const { command, args = [] } = config;
  const jobId = uuidv4();
  
  singleJobs[jobId] = {
    id: jobId,
    type,
    command,
    args,
    status: 'scheduled',
    createdAt: new Date(),
    startedAt: null,
    completedAt: null,
    output: null,
    error: null
  };
  
  // Execute job asynchronously
  process.nextTick(() => {
    singleJobs[jobId].status = 'running';
    singleJobs[jobId].startedAt = new Date();
    
    logToFile(`Starting single job ${jobId} (${type}): ${command} ${args.join(' ')}`);
    
    executeCommand(command, args, (error, output) => {
      singleJobs[jobId].completedAt = new Date();
      
      if (error) {
        singleJobs[jobId].status = 'failed';
        singleJobs[jobId].error = error.message;
        logToFile(`Single job ${jobId} failed: ${error.message}`, 'error');
      } else {
        singleJobs[jobId].status = 'completed';
        singleJobs[jobId].output = output;
        logToFile(`Single job ${jobId} completed successfully`);
      }
      
      // Clean up old jobs after 24 hours
      cleanupOldJobs();
    });
  });
  
  return jobId;
};

/**
 * Get status of a single job
 * @param {string} jobId - Job ID
 * @returns {Object|null} - Job status
 */
const getJobStatus = (jobId) => {
  return singleJobs[jobId] || null;
};

/**
 * Clean up old completed jobs
 */
const cleanupOldJobs = () => {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  
  for (const jobId in singleJobs) {
    const job = singleJobs[jobId];
    
    if (
      (job.status === 'completed' || job.status === 'failed') &&
      job.completedAt && 
      job.completedAt < oneDayAgo
    ) {
      delete singleJobs[jobId];
      logToFile(`Cleaned up old job: ${jobId}`);
    }
  }
};

/**
 * Get next run time for a cron schedule
 * @param {string} schedule - Cron schedule
 * @returns {Date|null} - Next run time
 */
const getNextRunTime = (schedule) => {
  try {
    return cron.schedule(schedule, () => {}).nextDate().toDate();
  } catch (error) {
    return null;
  }
};

/**
 * Initialize default cron jobs from configuration
 */
const initializeDefaultJobs = () => {
  try {
    const configPath = path.join(process.cwd(), 'config', 'cron.json');
    
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      
      if (config && config.jobs && Array.isArray(config.jobs)) {
        config.jobs.forEach(job => {
          try {
            addOrUpdateJob(job.name, job);
            logToFile(`Initialized default job: ${job.name}`);
          } catch (error) {
            logToFile(`Failed to initialize job ${job.name}: ${error.message}`, 'error');
          }
        });
      }
    }
  } catch (error) {
    logToFile(`Failed to initialize default jobs: ${error.message}`, 'error');
  }
};

/**
 * Shutdown all cron jobs gracefully
 * @returns {Promise<void>}
 */
const shutdown = async () => {
  try {
    // Stop all cron jobs
    for (const name in cronJobs) {
      if (cronJobs[name].task) {
        cronJobs[name].task.stop();
        logToFile(`Stopped cron job: ${name}`, 'info');
      }
    }
    
    // Wait for any active single jobs to complete
    const activeJobs = Object.values(singleJobs).filter(job => job.status === 'running');
    if (activeJobs.length > 0) {
      logToFile(`Waiting for ${activeJobs.length} active jobs to complete...`, 'info');
      
      // Wait for up to 5 seconds for jobs to complete
      await new Promise(resolve => {
        const startTime = Date.now();
        const checkInterval = setInterval(() => {
          const stillActive = Object.values(singleJobs).filter(job => job.status === 'running');
          
          if (stillActive.length === 0 || Date.now() - startTime > 5000) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 500);
      });
    }
    
    logToFile('Cron manager shutdown complete', 'info');
  } catch (error) {
    logToFile(`Error during shutdown: ${error.message}`, 'error');
  }
};

// Initialize default jobs when the module is loaded
initializeDefaultJobs();

module.exports = {
  addOrUpdateJob,
  removeJob,
  getAllJobs,
  getStatus,
  scheduleSingleJob,
  getJobStatus,
  shutdown
}; 