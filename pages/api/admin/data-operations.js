import { exec } from 'child_process';
import { promisify } from 'util';
import { updateOperationStatus } from './operation-status';
import { addOperationLog } from './operation-logs';

// Convert exec to promise-based
const execAsync = promisify(exec);

// Authentication middleware
const authenticate = (req, res, handler) => {
  const authToken = req.headers.authorization?.split(' ')[1];
  const validToken = process.env.ADMIN_API_TOKEN;

  if (!authToken || authToken !== validToken) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing token' });
  }

  return handler(req, res);
};

// Main handler for admin operations
async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { 
      operation, 
      year, 
      threads = 5, 
      overwrite = false,
      cronName,
      cronSchedule,
      cronEnabled = true
    } = req.body;

    if (!operation) {
      return res.status(400).json({ error: 'Operation parameter is required' });
    }

    // Validate year for all operations except cron management
    if (operation !== 'setup-cron' && operation !== 'list-crons' && operation !== 'remove-cron') {
      if (!year || isNaN(parseInt(year))) {
        return res.status(400).json({ error: 'Valid year parameter is required' });
      }
    }

    // Sanitize inputs to prevent command injection
    const sanitizedYear = parseInt(year || new Date().getFullYear(), 10);
    const sanitizedThreads = parseInt(threads, 10);
    const sanitizedOverwrite = overwrite === true;
    
    // Sanitize cron inputs if provided
    let sanitizedCronName = '';
    let sanitizedCronSchedule = '';
    
    if (cronName) {
      // Remove any characters that could be used for command injection
      sanitizedCronName = cronName.replace(/[^a-zA-Z0-9_-]/g, '');
      if (sanitizedCronName !== cronName) {
        return res.status(400).json({ error: 'Cron name contains invalid characters. Use only letters, numbers, hyphens, and underscores.' });
      }
    }
    
    if (cronSchedule) {
      // Basic validation for cron schedule format
      const cronRegex = /^(\*|([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])|\*\/([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])) (\*|([0-9]|1[0-9]|2[0-3])|\*\/([0-9]|1[0-9]|2[0-3])) (\*|([1-9]|1[0-9]|2[0-9]|3[0-1])|\*\/([1-9]|1[0-9]|2[0-9]|3[0-1])) (\*|([1-9]|1[0-2])|\*\/([1-9]|1[0-2])) (\*|([0-6])|\*\/([0-6]))$/;
      if (!cronRegex.test(cronSchedule)) {
        return res.status(400).json({ error: 'Invalid cron schedule format. Use standard cron syntax (e.g., "0 0 * * *" for daily at midnight)' });
      }
      sanitizedCronSchedule = cronSchedule;
    }

    let command;
    let operationName;

    switch (operation) {
      case 'scrape':
        command = `node scripts/scrapeIpos.js --year ${sanitizedYear} --start-year ${sanitizedYear} --end-year ${sanitizedYear} --threads ${sanitizedThreads} ${sanitizedOverwrite ? '--overwrite true' : ''}`;
        operationName = 'Scrape';
        break;
        
      case 'upload':
        command = `node scripts/uploadToMongo.js --year ${sanitizedYear} --start-year ${sanitizedYear} --end-year ${sanitizedYear}`;
        operationName = 'Upload';
        break;
        
      case 'scrape-and-upload':
        command = `node scripts/scrapeIpos.js --year ${sanitizedYear} --start-year ${sanitizedYear} --end-year ${sanitizedYear} --threads ${sanitizedThreads} ${sanitizedOverwrite ? '--overwrite true' : ''} && node scripts/uploadToMongo.js --year ${sanitizedYear} --start-year ${sanitizedYear} --end-year ${sanitizedYear}`;
        operationName = 'Scrape and Upload';
        break;
        
      case 'setup-cron':
        // Validate required cron parameters
        if (!sanitizedCronName) {
          return res.status(400).json({ error: 'cronName parameter is required for cron setup' });
        }
        if (!sanitizedCronSchedule) {
          return res.status(400).json({ error: 'cronSchedule parameter is required for cron setup' });
        }
        
        // Build the cron command - this will create a task that properly exits when done
        const cronCommand = `node scripts/scrapeIpos.js --year ${sanitizedYear} --threads ${sanitizedThreads} ${sanitizedOverwrite ? '--overwrite true' : ''} --mongo; exit 0`;
        
        command = `node scripts/cronManager.js add "${sanitizedCronName}" "${sanitizedCronSchedule}" "${cronCommand}" ${sanitizedYear} ${cronEnabled ? 'true' : 'false'}`;
        operationName = 'Setup Cron Job';
        break;

      case 'list-crons':
        command = `node scripts/cronManager.js list`;
        operationName = 'List Cron Jobs';
        break;
        
      case 'remove-cron':
        if (!sanitizedCronName) {
          return res.status(400).json({ error: 'cronName parameter is required to remove a cron job' });
        }
        command = `node scripts/cronManager.js remove "${sanitizedCronName}"`;
        operationName = 'Remove Cron Job';
        break;
        
      case 'start-crons':
        command = `node scripts/cronManager.js start`;
        operationName = 'Start Cron Jobs';
        break;
        
      case 'stop-crons':
        command = `node scripts/cronManager.js stop`;
        operationName = 'Stop Cron Jobs';
        break;
        
      default:
        return res.status(400).json({ error: 'Invalid operation. Use "scrape", "upload", "scrape-and-upload", "setup-cron", "list-crons", "remove-cron", "start-crons", or "stop-crons"' });
    }

    // Generate operation ID
    const operationId = Date.now().toString();
    
    // Initialize status as processing
    updateOperationStatus(operationId, 'processing', {
      command,
      operation,
      year: operation.includes('cron') ? undefined : sanitizedYear,
      startedAt: new Date().toISOString()
    });
    
    // Add initial log entry
    addOperationLog(operationId, `Starting ${operationName} operation`);
    if (operation.includes('cron')) {
      if (sanitizedCronName) {
        addOperationLog(operationId, `Cron job: ${sanitizedCronName}`);
      }
      if (sanitizedCronSchedule) {
        addOperationLog(operationId, `Schedule: ${sanitizedCronSchedule}`);
      }
    } else {
      addOperationLog(operationId, `Year: ${sanitizedYear}`);
    }
    addOperationLog(operationId, `Executing command: ${command}`);

    // Execute the command
    console.log(`Executing operation ${operationId}: ${command}`);
    
    // Start the process and capture output in real-time
    const childProcess = exec(command);
    
    // Capture stdout in real-time
    childProcess.stdout.on('data', (data) => {
      const lines = data.toString().trim().split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          console.log(`[${operationId}] ${line}`);
          addOperationLog(operationId, line);
        }
      });
    });
    
    // Capture stderr in real-time
    childProcess.stderr.on('data', (data) => {
      const lines = data.toString().trim().split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          console.error(`[${operationId}] Error: ${line}`);
          addOperationLog(operationId, `Error: ${line}`);
        }
      });
    });
    
    // Handle process completion
    childProcess.on('exit', (code) => {
      const status = code === 0 ? 'completed' : 'failed';
      const message = code === 0 
        ? `Operation completed successfully with exit code ${code}` 
        : `Operation failed with exit code ${code}`;
        
      console.log(`[${operationId}] ${message}`);
      addOperationLog(operationId, message);
      
      updateOperationStatus(operationId, status, {
        exitCode: code,
        completedAt: new Date().toISOString()
      });
    });
    
    // Handle process errors
    childProcess.on('error', (error) => {
      console.error(`[${operationId}] Process error:`, error);
      addOperationLog(operationId, `Process error: ${error.message}`);
      
      updateOperationStatus(operationId, 'failed', {
        error: error.message,
        completedAt: new Date().toISOString()
      });
    });

    // Return immediately with operation ID and endpoints for status and logs
    return res.status(202).json({ 
      message: `${operationName} operation${operation.includes('cron') ? '' : ` for year ${sanitizedYear}`} started successfully`,
      operationId,
      operation,
      ...(operation.includes('cron') ? { cronName: sanitizedCronName, cronSchedule: sanitizedCronSchedule } : { year: sanitizedYear }),
      status: 'processing',
      statusEndpoint: `/api/admin/operation-status?operationId=${operationId}`,
      logsEndpoint: `/api/admin/operation-logs?operationId=${operationId}`
    });
    
  } catch (error) {
    console.error('Admin operation error:', error);
    return res.status(500).json({ error: 'Failed to execute operation', details: error.message });
  }
}

// Export with authentication middleware
export default (req, res) => authenticate(req, res, handler); 