import pLimit from 'p-limit';
import os from 'os';

// Create a reusable limiter for database operations
// Adjust the concurrency limit based on your server capacity and MongoDB connection pool
const dbLimit = pLimit(20); // Limit to 20 concurrent DB operations

// Create a limiter for CPU-intensive operations
const cpuLimit = pLimit(Math.max(1, Math.floor(os.cpus().length / 2))); // Use half of available CPU cores

/**
 * Run a database operation with concurrency control
 * @param {Function} fn - The function to execute
 * @param {...any} args - Arguments to pass to the function
 * @returns {Promise<any>} - The result of the function
 */
export async function limitDb(fn, ...args) {
  return dbLimit(() => fn(...args));
}

/**
 * Run a CPU-intensive operation with concurrency control
 * @param {Function} fn - The function to execute
 * @param {...any} args - Arguments to pass to the function
 * @returns {Promise<any>} - The result of the function
 */
export async function limitCpu(fn, ...args) {
  return cpuLimit(() => fn(...args));
}

/**
 * Throttle a function to be called at most once per specified interval
 * @param {Function} fn - The function to throttle
 * @param {number} interval - The interval in milliseconds
 * @returns {Function} - The throttled function
 */
export function throttle(fn, interval = 100) {
  let lastCall = 0;
  let queued = false;
  let lastArgs = null;
  let timer = null;
  
  const execute = () => {
    if (lastArgs) {
      fn(...lastArgs);
      lastArgs = null;
    }
    lastCall = Date.now();
    queued = false;
  };
  
  return (...args) => {
    lastArgs = args;
    
    if (!queued) {
      const now = Date.now();
      const elapsed = now - lastCall;
      
      if (elapsed >= interval) {
        // Execute immediately
        execute();
      } else {
        // Queue execution
        queued = true;
        clearTimeout(timer);
        timer = setTimeout(execute, interval - elapsed);
      }
    }
  };
}

/**
 * Create a concurrent batch processor
 * @param {number} batchSize - Number of items to process in each batch
 * @param {number} concurrency - Number of batches to process concurrently
 * @returns {Function} - Batch processor function
 */
export function batchProcessor(batchSize = 10, concurrency = 3) {
  const limit = pLimit(concurrency);
  
  /**
   * Process items in batches
   * @param {Array} items - Array of items to process
   * @param {Function} processor - Function to process each item
   * @returns {Promise<Array>} - Array of processed results
   */
  return async function processBatches(items, processor) {
    // Split items into batches
    const batches = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    
    // Process batches concurrently
    const results = await Promise.all(
      batches.map(batch => limit(async () => {
        return Promise.all(batch.map(processor));
      }))
    );
    
    // Flatten results
    return results.flat();
  };
} 