import { parentPort } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current file directory
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Map to store task handlers
const taskHandlers = new Map();

// Notify parent we're idle
parentPort.postMessage({ type: 'idle' });

// Handle messages from parent
parentPort.on('message', async (message) => {
  if (message.type === 'task') {
    const { taskName, data } = message;
    
    try {
      // Try to get cached task handler
      let taskHandler = taskHandlers.get(taskName);
      
      // Load task handler if not cached
      if (!taskHandler) {
        // Dynamic import the task handler
        const module = await import(`${__dirname}/tasks/${taskName}.js`);
        taskHandler = module.default;
        
        // Cache the task handler
        taskHandlers.set(taskName, taskHandler);
      }
      
      // Execute task
      const result = await taskHandler(data);
      
      // Send result back to parent
      parentPort.postMessage({
        type: 'result',
        taskName,
        result
      });
    } catch (error) {
      // Send error back to parent
      parentPort.postMessage({
        type: 'result',
        taskName,
        error: error.message
      });
    }
    
    // Notify parent we're idle again
    parentPort.postMessage({ type: 'idle' });
  }
}); 