/**
 * Debounce function to limit the rate at which a function can fire
 * 
 * @param {Function} func - Function to be debounced
 * @param {number} wait - Milliseconds to wait before calling the function
 * @param {boolean} immediate - Whether to call the function immediately
 * @returns {Function} Debounced function
 */
export const debounce = (func, wait = 300, immediate = false) => {
  let timeout;
  
  return function(...args) {
    const context = this;
    
    const later = () => {
      timeout = null;
      if (!immediate) func.apply(context, args);
    };
    
    const callNow = immediate && !timeout;
    
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    
    if (callNow) func.apply(context, args);
  };
};

/**
 * Search IPOs with query string - optimized for AJAX
 * 
 * @param {string} query - Search query
 * @param {number} page - Page number
 * @param {number} limit - Results per page
 * @returns {Promise<Object>} - Search results
 */
export const searchIPOs = async (query, page = 1, limit = 10) => {
  // Don't search if query is too short
  if (!query || query.trim().length < 2) {
    return {
      data: [],
      total: 0,
      page,
      limit,
      totalPages: 0,
      query: query || ''
    };
  }
  
  try {
    // Build API URL with params
    const params = new URLSearchParams({
      q: query.trim(),
      page,
      limit
    });
    
    // Send request with AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    const response = await fetch(`/api/ipos/search?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`Search failed: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    // Handle AbortController timeout
    if (error.name === 'AbortError') {
      console.error('Search request timed out');
      return {
        data: [],
        error: 'Request timed out',
        page,
        limit,
        total: 0,
        totalPages: 0,
        query
      };
    }
    
    console.error('Error searching IPOs:', error);
    return {
      data: [],
      error: error.message,
      page,
      limit,
      total: 0,
      totalPages: 0,
      query
    };
  }
}; 