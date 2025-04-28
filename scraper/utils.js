/**
 * Common utility functions for IPO data scraping
 */

/**
 * Cleans and normalizes text content
 * @param {string} text - Raw text to clean
 * @param {boolean} removeTags - Whether to strip HTML tags
 * @returns {string} - Cleaned text
 */
const cleanText = (text, removeTags = true) => {
  if (!text) return '';
  
  let cleanedText = text.toString().trim();
  
  // Remove HTML tags if specified
  if (removeTags) {
    cleanedText = cleanedText.replace(/<\/?[^>]+(>|$)/g, "");
  }
  
  // Normalize whitespace
  cleanedText = cleanedText.replace(/\s+/g, ' ');
  
  // Remove non-breaking spaces and other special whitespace
  cleanedText = cleanedText.replace(/\u00A0/g, ' ');
  
  // Remove leading/trailing whitespace again (after all replacements)
  cleanedText = cleanedText.trim();
  
  return cleanedText;
};

/**
 * Sanitizes text to create valid object keys
 * @param {string} key - Text to sanitize
 * @param {string} ipoName - IPO name for context (optional)
 * @returns {string} - Sanitized key
 */
const sanitizeKey = (key, ipoName = '') => {
  if (!key) return 'unknown';
  
  // Remove the IPO name from the key if it exists (for better standardization)
  if (ipoName) {
    const ipoNameNoSpaces = ipoName.replace(/\s+/g, '').toLowerCase();
    key = key.replace(new RegExp(ipoNameNoSpaces, 'i'), '');
  }
  
  // Convert to lowercase, replace spaces and special chars with underscore
  let sanitized = key.toLowerCase()
      .replace(/[^\w\s]/g, '')  // Remove all non-word chars except spaces
      .replace(/\s+/g, '_')     // Replace spaces with underscores
      .replace(/_+/g, '_')      // Collapse multiple underscores
      .replace(/^_+|_+$/g, ''); // Remove leading/trailing underscores
  
  // Handle special cases
  if (sanitized === 'nii') return 'nii';  // Non-Institutional Investors
  if (sanitized === 'qib') return 'qib';  // Qualified Institutional Buyers
  if (sanitized === 'retail') return 'retail';
  if (sanitized === 'total') return 'total';
  
  return sanitized || 'unknown';
};

module.exports = {
  cleanText,
  sanitizeKey
}; 