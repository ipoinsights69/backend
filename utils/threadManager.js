const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const path = require('path');

/**
 * Creates and manages worker threads for parallel processing
 * @param {Array} items - Array of items to process in parallel
 * @param {string} workerScript - Path to the worker script
 * @param {Object} options - Configuration options
 * @returns {Promise<Array>} - Results from all workers
 */
async function processInThreads(items, workerScript, options = {}) {
  const {
    maxThreads = 4,
    workerData: extraWorkerData = {},
    onProgress = null,
    chunkSize = 1
  } = options;

  // If no items, return empty array
  if (!items || items.length === 0) {
    return [];
  }

  // Calculate optimal number of threads based on CPU and item count
  const cpuCount = require('os').cpus().length;
  const itemCount = items.length;
  const threadCount = Math.min(
    maxThreads,
    cpuCount - 1 || 1, // Leave one CPU core free
    Math.ceil(itemCount / chunkSize) // Don't create more threads than needed
  );

  console.log(`Starting parallel processing with ${threadCount} threads for ${itemCount} items`);
  console.log(`Each thread will process approximately ${Math.ceil(itemCount / threadCount)} items`);

  // Split items into chunks for each thread
  const chunks = [];
  const itemsPerThread = Math.ceil(itemCount / threadCount);
  
  for (let i = 0; i < threadCount; i++) {
    const start = i * itemsPerThread;
    const end = Math.min(start + itemsPerThread, itemCount);
    chunks.push(items.slice(start, end));
  }

  // Create and start worker threads
  const workers = chunks.map((chunk, index) => {
    return new Promise((resolve, reject) => {
      const worker = new Worker(workerScript, {
        workerData: {
          threadId: index,
          items: chunk,
          ...extraWorkerData
        }
      });

      // Track progress
      let processedCount = 0;
      const totalItems = chunk.length;

      // Handle messages from the worker
      worker.on('message', message => {
        if (message.type === 'progress') {
          processedCount = message.processed;
          if (onProgress) {
            onProgress({
              threadId: index,
              processed: processedCount,
              total: totalItems,
              percentage: Math.round((processedCount / totalItems) * 100)
            });
          }
        } else if (message.type === 'result') {
          resolve(message.data);
        }
      });

      // Handle errors
      worker.on('error', reject);
      
      // Handle unexpected worker exit
      worker.on('exit', code => {
        if (code !== 0) {
          reject(new Error(`Worker stopped with exit code ${code}`));
        }
      });
    });
  });

  // Wait for all workers to complete
  const results = await Promise.all(workers);
  
  // Flatten and return results
  return results.flat();
}

/**
 * Worker thread function to process items in parallel
 * @param {Function} processingFunction - Function to process each item
 * @param {Object} options - Processing options
 */
async function workerThread(processingFunction, options = {}) {
  if (!isMainThread) {
    const { items, threadId, ...otherData } = workerData;
    const results = [];
    let processed = 0;

    try {
      // Process each item in the chunk
      for (const item of items) {
        const result = await processingFunction(item, { threadId, ...otherData });
        if (result !== null && result !== undefined) {
          results.push(result);
        }
        
        // Update progress
        processed++;
        if (processed % 1 === 0 || processed === items.length) { // Report every item
          parentPort.postMessage({
            type: 'progress',
            processed
          });
        }
      }

      // Send back all results
      parentPort.postMessage({
        type: 'result',
        data: results
      });
    } catch (error) {
      console.error(`Error in worker thread ${threadId}:`, error);
      parentPort.postMessage({
        type: 'result',
        data: results // Return partial results
      });
    }
  }
}

module.exports = {
  processInThreads,
  workerThread
}; 