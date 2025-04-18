// Authentication middleware
const authenticate = (req, res, handler) => {
  const authToken = req.headers.authorization?.split(' ')[1];
  const validToken = process.env.ADMIN_API_TOKEN;

  if (!authToken || authToken !== validToken) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing token' });
  }

  return handler(req, res);
};

// Simple in-memory storage for operation statuses
// In production, you would use a database
const operationStatuses = new Map();

// Update operation status - to be called from the main operation process
export const updateOperationStatus = (operationId, status, result = null) => {
  operationStatuses.set(operationId, {
    status, // 'processing', 'completed', 'failed'
    result,
    updatedAt: new Date()
  });
  
  // Clean up old entries (older than 24 hours)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  for (const [id, data] of operationStatuses.entries()) {
    if (data.updatedAt < oneDayAgo) {
      operationStatuses.delete(id);
    }
  }
};

// Handler to check operation status
async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { operationId } = req.query;

    if (!operationId) {
      return res.status(400).json({ error: 'Operation ID is required' });
    }

    const operationStatus = operationStatuses.get(operationId);

    if (!operationStatus) {
      return res.status(404).json({ 
        error: 'Operation not found or has expired',
        note: 'Operation statuses are only kept for 24 hours'
      });
    }

    return res.status(200).json({
      operationId,
      ...operationStatus,
      updatedAt: operationStatus.updatedAt.toISOString()
    });
  } catch (error) {
    console.error('Error checking operation status:', error);
    return res.status(500).json({ error: 'Failed to check operation status' });
  }
}

// Export with authentication middleware
export default (req, res) => authenticate(req, res, handler); 