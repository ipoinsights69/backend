const fs = require('fs').promises;
const path = require('path');

/**
 * Ensures that a directory exists, creating it if necessary
 * @param {string} dirPath - Path to directory
 */
async function ensureDirectoryExists(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

/**
 * Sanitizes a string to be used as a filename
 * @param {string} str - String to sanitize
 * @returns {string} - Sanitized string
 */
function sanitizeFilename(str) {
  if (!str) return 'unknown';
  return str
    .replace(/[^a-z0-9]/gi, '_')
    .toLowerCase()
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Saves data to a JSON file
 * @param {string} dirPath - Directory path
 * @param {string} filename - File name
 * @param {Object} data - Data to save
 */
async function saveToJson(dirPath, filename, data) {
  try {
    await ensureDirectoryExists(dirPath);
    const filePath = path.join(dirPath, filename);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    return filePath;
  } catch (error) {
    console.error(`Error saving to ${filename}:`, error);
    throw error;
  }
}

/**
 * Extracts the IPO ID from a URL
 * @param {string} url - The IPO detail URL
 * @returns {string|null} - The extracted ID or null
 */
function extractIpoId(url) {
  if (!url) return null;
  const match = url.match(/\/ipo\/[^\/]+\/(\d+)\//);
  return match ? match[1] : null;
}

/**
 * Formats the current date as YYYY-MM-DD
 * @returns {string} - Formatted date
 */
function getFormattedDate() {
  return new Date().toISOString().split('T')[0];
}

module.exports = {
  ensureDirectoryExists,
  sanitizeFilename,
  saveToJson,
  extractIpoId,
  getFormattedDate
}; 