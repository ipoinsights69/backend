// Authentication middleware
const authenticate = (req, res, handler) => {
  const authToken = req.headers.authorization?.split(' ')[1];
  const validToken = process.env.ADMIN_API_TOKEN;

  if (!authToken || authToken !== validToken) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing token' });
  }

  return handler(req, res);
};

// In-memory log storage
const operationLogs = new Map();

// Add a log entry to the operation
export const addOperationLog = (operationId, logEntry) => {
  if (!operationLogs.has(operationId)) {
    operationLogs.set(operationId, []);
  }
  
  const logs = operationLogs.get(operationId);
  const timestamp = new Date().toISOString();
  
  logs.push({
    timestamp,
    message: logEntry,
  });
  
  // Keep only the last 1000 log entries to prevent memory issues
  if (logs.length > 1000) {
    logs.shift(); // Remove oldest entry
  }
  
  // Clean up old logs (older than 24 hours)
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  for (const [id, entries] of operationLogs.entries()) {
    if (entries.length > 0) {
      const oldestEntryTime = new Date(entries[0].timestamp).getTime();
      if (oldestEntryTime < oneDayAgo) {
        operationLogs.delete(id);
      }
    }
  }
};

// Handler to get operation logs
async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { operationId, since } = req.query;

    if (!operationId) {
      return res.status(400).json({ error: 'Operation ID is required' });
    }

    const logs = operationLogs.get(operationId) || [];
    
    // Filter logs by timestamp if 'since' is provided
    let filteredLogs = logs;
    if (since) {
      try {
        const sinceDate = new Date(since);
        filteredLogs = logs.filter(log => new Date(log.timestamp) > sinceDate);
      } catch (e) {
        return res.status(400).json({ error: 'Invalid timestamp format for "since" parameter' });
      }
    }

    return res.status(200).json({
      operationId,
      count: filteredLogs.length,
      logs: filteredLogs,
      nextPoll: filteredLogs.length > 0 
        ? filteredLogs[filteredLogs.length - 1].timestamp 
        : since || new Date().toISOString()
    });
  } catch (error) {
    console.error('Error retrieving operation logs:', error);
    return res.status(500).json({ error: 'Failed to retrieve operation logs' });
  }
}

// Export with authentication middleware
export default (req, res) => authenticate(req, res, handler); 