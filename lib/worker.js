import { Worker } from 'worker_threads';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

// Get current file directory
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Worker thread pool for CPU-intensive tasks
const workers = [];
const MAX_WORKERS = Math.max(1, Math.min(os.cpus().length - 1, 4)); // Use at most n-1 cores, max 4
const WORKER_TIMEOUT = 30000; // 30 seconds timeout

/**
 * Initializes the worker pool
 */
export function initWorkerPool() {
  // Only initialize if not already done
  if (workers.length) return;
  
  for (let i = 0; i < MAX_WORKERS; i++) {
    const worker = new Worker(path.join(__dirname, 'worker-thread.js'));
    worker.busy = false;
    worker.id = i;
    
    // Handle messages from worker
    worker.on('message', (message) => {
      const { type, id } = message;
      if (type === 'idle') {
        worker.busy = false;
      }
    });
    
    // Handle worker errors
    worker.on('error', (err) => {
      console.error(`Worker ${i} error:`, err);
      // Restart worker
      workers[i] = createWorker(i);
    });
    
    workers.push(worker);
  }
}

/**
 * Creates a new worker
 * @param {number} id - Worker ID
 * @returns {Worker} - New worker
 */
function createWorker(id) {
  const worker = new Worker(path.join(__dirname, 'worker-thread.js'));
  worker.busy = false;
  worker.id = id;
  
  // Handle messages from worker
  worker.on('message', (message) => {
    const { type } = message;
    if (type === 'idle') {
      worker.busy = false;
    }
  });
  
  // Handle worker errors
  worker.on('error', (err) => {
    console.error(`Worker ${id} error:`, err);
    // Restart worker
    workers[id] = createWorker(id);
  });
  
  return worker;
}

/**
 * Get available worker from pool
 * @returns {Worker|null} - Available worker or null
 */
function getAvailableWorker() {
  // Initialize worker pool if not done
  if (!workers.length) {
    initWorkerPool();
  }
  
  // Find first available worker
  for (const worker of workers) {
    if (!worker.busy) {
      worker.busy = true;
      return worker;
    }
  }
  
  return null;
}

/**
 * Run a task in a worker thread with timeout
 * @param {string} taskName - Name of the task to run
 * @param {object} data - Data to pass to the task
 * @returns {Promise<any>} - Result of the task
 */
export async function runTask(taskName, data) {
  // Get available worker
  const worker = getAvailableWorker();
  
  if (!worker) {
    // No worker available, execute in main thread (fallback)
    try {
      // Dynamic import the task handler
      const { default: taskHandler } = await import(`./tasks/${taskName}.js`);
      return await taskHandler(data);
    } catch (error) {
      console.error(`Error running task ${taskName} in main thread:`, error);
      throw new Error(`Failed to execute task: ${error.message}`);
    }
  }
  
  // Execute in worker thread
  return new Promise((resolve, reject) => {
    // Set timeout
    const timeoutId = setTimeout(() => {
      worker.busy = false;
      reject(new Error(`Task ${taskName} timed out after ${WORKER_TIMEOUT}ms`));
    }, WORKER_TIMEOUT);
    
    // Handle worker response
    const messageHandler = (message) => {
      const { type, result, error } = message;
      
      if (type === 'result' && message.taskName === taskName) {
        clearTimeout(timeoutId);
        worker.removeListener('message', messageHandler);
        
        if (error) {
          reject(new Error(error));
        } else {
          resolve(result);
        }
      }
    };
    
    worker.on('message', messageHandler);
    
    // Send task to worker
    worker.postMessage({
      type: 'task',
      taskName,
      data
    });
  });
} 