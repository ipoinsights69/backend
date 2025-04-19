const NodeCache = require('node-cache');

// Initialize cache with a standard TTL (e.g., 10 minutes)
// Adjust stdTTL as needed based on how often your data changes
const cache = new NodeCache({ stdTTL: 600 });

module.exports = cache; 