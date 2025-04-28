const fs = require('fs').promises;
const path = require('path');
const glob = require('glob');

// Base directory for JSON data files
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

/**
 * Get IPO data from JSON files
 */
class JsonDataService {
  /**
   * Get all IPO listings from JSON files
   * @param {Object} query - Query parameters
   * @returns {Promise<Array>} - Array of IPO listings
   */
  async getIpos(query = {}) {
    try {
      // Get all available years from the data directory
      const years = await this.getAvailableYears();
      
      // Collect all IPO listings
      let allIpos = [];
      
      for (const year of years) {
        const yearPath = path.join(DATA_DIR, year.toString(), '_listings.json');
        try {
          const fileData = await fs.readFile(yearPath, 'utf8');
          const yearIpos = JSON.parse(fileData);
          
          // Add computed fields similar to MongoDB model
          yearIpos.forEach(ipo => {
            // Set ipo_id if not set
            if (!ipo.ipo_id) {
              ipo.ipo_id = `${ipo.year}_${ipo.company_name.toLowerCase().replace(/\s+/g, '_')}`;
            }
            
            // Extract numeric value from issue_price
            if (ipo.issue_price && !ipo.issue_price_numeric) {
              const priceMatch = ipo.issue_price.match(/\d+(?:\.\d+)?/);
              if (priceMatch) {
                ipo.issue_price_numeric = parseFloat(priceMatch[0]);
              }
            }
            
            // Determine IPO status based on dates
            if (!ipo.status) {
              ipo.status = this.determineStatus(ipo);
            }
          });
          
          allIpos = allIpos.concat(yearIpos);
        } catch (error) {
          console.error(`Error reading listings for year ${year}:`, error);
          // Continue with other years if one fails
        }
      }
      
      // Apply filtering based on query
      let filteredIpos = allIpos;
      
      // Filter by year
      if (query.year) {
        filteredIpos = filteredIpos.filter(ipo => ipo.year === parseInt(query.year));
      }
      
      // Filter by status
      if (query.status && ['upcoming', 'open', 'closed', 'listed'].includes(query.status)) {
        filteredIpos = filteredIpos.filter(ipo => ipo.status === query.status);
      }
      
      // Filter by price range
      if (query.minPrice !== null && query.minPrice !== undefined) {
        filteredIpos = filteredIpos.filter(ipo => 
          ipo.issue_price_numeric && ipo.issue_price_numeric >= parseFloat(query.minPrice)
        );
      }
      
      if (query.maxPrice !== null && query.maxPrice !== undefined) {
        filteredIpos = filteredIpos.filter(ipo => 
          ipo.issue_price_numeric && ipo.issue_price_numeric <= parseFloat(query.maxPrice)
        );
      }
      
      // Apply sorting
      const sort = query.sort || '-opening_date';
      const sortField = sort.startsWith('-') ? sort.substring(1) : sort;
      const sortDirection = sort.startsWith('-') ? -1 : 1;
      
      filteredIpos.sort((a, b) => {
        // Handle null or undefined values
        if (!a[sortField] && !b[sortField]) return 0;
        if (!a[sortField]) return sortDirection === 1 ? -1 : 1;
        if (!b[sortField]) return sortDirection === 1 ? 1 : -1;
        
        // For date fields, convert to date objects
        if (['opening_date', 'closing_date', 'listing_date'].includes(sortField)) {
          const dateA = new Date(a[sortField]);
          const dateB = new Date(b[sortField]);
          return sortDirection === 1 ? dateA - dateB : dateB - dateA;
        }
        
        // For numeric fields
        if (typeof a[sortField] === 'number' && typeof b[sortField] === 'number') {
          return sortDirection === 1 ? a[sortField] - b[sortField] : b[sortField] - a[sortField];
        }
        
        // For string fields
        return sortDirection === 1 
          ? String(a[sortField]).localeCompare(String(b[sortField])) 
          : String(b[sortField]).localeCompare(String(a[sortField]));
      });
      
      // Apply pagination
      const page = parseInt(query.page) || 1;
      const limit = Math.min(parseInt(query.limit) || 10, 100);
      const skip = (page - 1) * limit;
      
      const paginatedIpos = filteredIpos.slice(skip, skip + limit);
      
      return {
        ipos: paginatedIpos,
        total: filteredIpos.length
      };
    } catch (error) {
      console.error('Error in getIpos:', error);
      throw error;
    }
  }

  /**
   * Get detailed IPO information by ID
   * @param {string} ipoId - IPO ID
   * @returns {Promise<Object>} - IPO details
   */
  async getIpoById(ipoId) {
    try {
      // Find the IPO in listings to get the year
      const years = await this.getAvailableYears();
      let targetIpo = null;
      
      for (const year of years) {
        const yearPath = path.join(DATA_DIR, year.toString(), '_listings.json');
        try {
          const fileData = await fs.readFile(yearPath, 'utf8');
          const yearIpos = JSON.parse(fileData);
          
          // Find the IPO with matching ID
          const ipo = yearIpos.find(ipo => {
            const computedId = ipo.ipo_id || `${ipo.year}_${ipo.company_name.toLowerCase().replace(/\s+/g, '_')}`;
            return computedId === ipoId;
          });
          
          if (ipo) {
            targetIpo = ipo;
            break;
          }
        } catch (error) {
          console.error(`Error reading listings for year ${year}:`, error);
          // Continue with other years if one fails
        }
      }
      
      if (!targetIpo) {
        return null;
      }
      
      // Construct file path to detailed JSON file
      const fileName = `${ipoId.split('_').slice(1).join('_')}.json`;
      const filePath = path.join(DATA_DIR, targetIpo.year.toString(), fileName);
      
      try {
        const detailData = await fs.readFile(filePath, 'utf8');
        const ipoDetail = JSON.parse(detailData);
        
        // Merge basic and detailed information
        return {
          ...targetIpo,
          ...ipoDetail
        };
      } catch (error) {
        console.error(`Error reading IPO detail file:`, error);
        // Return basic information if detail file not found
        return targetIpo;
      }
    } catch (error) {
      console.error('Error in getIpoById:', error);
      throw error;
    }
  }

  /**
   * Search IPOs by keyword
   * @param {string} query - Search query
   * @param {Object} options - Pagination options
   * @returns {Promise<Object>} - Search results
   */
  async searchIpos(query, options = {}) {
    try {
      const { ipos } = await this.getIpos();
      
      // Filter by keyword search (case-insensitive)
      const regex = new RegExp(query, 'i');
      const filteredIpos = ipos.filter(ipo => 
        regex.test(ipo.company_name) || regex.test(ipo.ipo_name || '')
      );
      
      // Apply pagination
      const page = parseInt(options.page) || 1;
      const limit = Math.min(parseInt(options.limit) || 10, 100);
      const skip = (page - 1) * limit;
      
      const paginatedIpos = filteredIpos.slice(skip, skip + limit);
      
      return {
        ipos: paginatedIpos,
        total: filteredIpos.length
      };
    } catch (error) {
      console.error('Error in searchIpos:', error);
      throw error;
    }
  }

  /**
   * Get IPOs sorted by performance metrics
   * @param {Object} options - Query options
   * @returns {Promise<Array>} - Sorted IPOs
   */
  async getPerformance(options = {}) {
    try {
      const { ipos } = await this.getIpos();
      
      // Filter by performance score existence
      let filteredIpos = ipos.filter(ipo => 
        ipo.performance_score !== undefined && ipo.performance_score !== null
      );
      
      // Filter by year if specified
      if (options.year) {
        filteredIpos = filteredIpos.filter(ipo => ipo.year === parseInt(options.year));
      }
      
      // Sort by performance score
      const sortOrder = options.type === 'worst' ? 1 : -1;
      filteredIpos.sort((a, b) => sortOrder * (a.performance_score - b.performance_score));
      
      // Apply limit
      const limit = Math.min(parseInt(options.limit) || 10, 100);
      return filteredIpos.slice(0, limit);
    } catch (error) {
      console.error('Error in getPerformance:', error);
      throw error;
    }
  }

  /**
   * Get years with IPO data
   * @returns {Promise<Array>} - Available years
   */
  async getAvailableYears() {
    try {
      const dirs = await fs.readdir(DATA_DIR);
      return dirs
        .filter(dir => /^\d{4}$/.test(dir)) // Only include directories named as years
        .map(dir => parseInt(dir))
        .sort((a, b) => b - a); // Sort descending
    } catch (error) {
      console.error('Error getting available years:', error);
      return [];
    }
  }

  /**
   * Get IPOs categories
   * @param {Object} options - Query options
   * @returns {Promise<Object>} - Categories or IPOs by category
   */
  async getCategories(options = {}) {
    try {
      const { ipos } = await this.getIpos();
      
      // Filter by year if specified
      let filteredIpos = ipos;
      if (options.year) {
        filteredIpos = filteredIpos.filter(ipo => ipo.year === parseInt(options.year));
      }
      
      // If no category specified, return list of distinct categories
      if (!options.category) {
        const categories = [...new Set(
          filteredIpos
            .filter(ipo => ipo.category)
            .map(ipo => ipo.category)
        )];
        
        return { categories };
      }
      
      // Filter by specified category
      const categoryIpos = filteredIpos.filter(ipo => 
        ipo.category && ipo.category.toLowerCase() === options.category.toLowerCase()
      );
      
      return { ipos: categoryIpos };
    } catch (error) {
      console.error('Error in getCategories:', error);
      throw error;
    }
  }

  /**
   * Get IPO statistics
   * @param {Object} options - Query options
   * @returns {Promise<Object>} - IPO statistics
   */
  async getStats(options = {}) {
    try {
      const { ipos } = await this.getIpos();
      
      // Filter by year if specified
      let filteredIpos = ipos;
      if (options.year) {
        filteredIpos = filteredIpos.filter(ipo => ipo.year === parseInt(options.year));
      }
      
      // Calculate statistics
      const totalCount = filteredIpos.length;
      
      // Count by status
      const statusCounts = {
        upcoming: 0,
        open: 0,
        closed: 0,
        listed: 0,
        unknown: 0
      };
      
      filteredIpos.forEach(ipo => {
        const status = ipo.status || 'unknown';
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      });
      
      // Group by listing type
      const listingTypeCounts = {};
      filteredIpos.forEach(ipo => {
        const listingAt = ipo.listing_at || 'Unknown';
        listingTypeCounts[listingAt] = (listingTypeCounts[listingAt] || 0) + 1;
      });
      
      return {
        total: totalCount,
        by_status: statusCounts,
        by_listing_type: listingTypeCounts
      };
    } catch (error) {
      console.error('Error in getStats:', error);
      throw error;
    }
  }

  /**
   * Helper function to determine IPO status based on dates
   * @param {Object} ipo - IPO data
   * @returns {string} - IPO status
   */
  determineStatus(ipo) {
    const now = new Date();
    
    // Parse dates safely - try different date formats
    let openingDate = null;
    let closingDate = null;
    let listingDate = null;
    
    // Try to parse dates using different formats
    if (ipo.opening_date) {
      // Try standard format
      openingDate = new Date(ipo.opening_date);
      // If invalid, try to extract date from string like "May 02, 2025"
      if (isNaN(openingDate.getTime())) {
        const match = ipo.opening_date.match(/([A-Za-z]+)\s+(\d+),?\s+(\d{4})/);
        if (match) {
          const [_, month, day, year] = match;
          openingDate = new Date(`${month} ${day}, ${year}`);
        }
      }
    }
    
    if (ipo.closing_date) {
      closingDate = new Date(ipo.closing_date);
      if (isNaN(closingDate.getTime())) {
        const match = ipo.closing_date.match(/([A-Za-z]+)\s+(\d+),?\s+(\d{4})/);
        if (match) {
          const [_, month, day, year] = match;
          closingDate = new Date(`${month} ${day}, ${year}`);
        }
      }
    }
    
    if (ipo.listing_date) {
      // Skip "Not yet listed" strings
      if (ipo.listing_date !== "Not yet listed") {
        listingDate = new Date(ipo.listing_date);
        if (isNaN(listingDate.getTime())) {
          const match = ipo.listing_date.match(/([A-Za-z]+)\s+(\d+),?\s+(\d{4})/);
          if (match) {
            const [_, month, day, year] = match;
            listingDate = new Date(`${month} ${day}, ${year}`);
          }
        }
      }
    }
    
    // Also check if we have dates in basicDetails
    if (ipo.basicDetails) {
      if (!openingDate && ipo.basicDetails.ipoOpenDate) {
        const match = ipo.basicDetails.ipoOpenDate.match(/([A-Za-z]+),\s+([A-Za-z]+)\s+(\d+),?\s+(\d{4})/);
        if (match) {
          const [_, dayOfWeek, month, day, year] = match;
          openingDate = new Date(`${month} ${day}, ${year}`);
        }
      }
      
      if (!closingDate && ipo.basicDetails.ipoCloseDate) {
        const match = ipo.basicDetails.ipoCloseDate.match(/([A-Za-z]+),\s+([A-Za-z]+)\s+(\d+),?\s+(\d{4})/);
        if (match) {
          const [_, dayOfWeek, month, day, year] = match;
          closingDate = new Date(`${month} ${day}, ${year}`);
        }
      }
      
      if (!listingDate && ipo.basicDetails.ipoListingDate) {
        const match = ipo.basicDetails.ipoListingDate.match(/([A-Za-z]+),\s+([A-Za-z]+)\s+(\d+),?\s+(\d{4})/);
        if (match) {
          const [_, dayOfWeek, month, day, year] = match;
          listingDate = new Date(`${month} ${day}, ${year}`);
        }
      }
    }

    // Handle invalid dates
    if (openingDate && isNaN(openingDate.getTime())) openingDate = null;
    if (closingDate && isNaN(closingDate.getTime())) closingDate = null;
    if (listingDate && isNaN(listingDate.getTime())) listingDate = null;
    
    // Get year from IPO object to handle future dates
    const ipoYear = ipo.year || new Date().getFullYear();
    const currentYear = new Date().getFullYear();
    
    // If this is a future year IPO and we have opening/closing dates, consider them upcoming
    if (ipoYear > currentYear && openingDate && closingDate) {
      return 'upcoming';
    }
    
    // Determine status based on dates
    if (openingDate && now < openingDate) {
      return 'upcoming';
    } else if (openingDate && closingDate && now >= openingDate && now <= closingDate) {
      return 'open';
    } else if (closingDate && listingDate && now > closingDate && now < listingDate) {
      return 'closed';
    } else if (listingDate && now >= listingDate) {
      return 'listed';
    } else if (openingDate && closingDate && listingDate === null) {
      // If we have opening and closing dates but no listing date, it's probably upcoming or open
      if (now < openingDate) {
        return 'upcoming';
      } else if (now >= openingDate && now <= closingDate) {
        return 'open';
      } else if (now > closingDate) {
        return 'closed';
      }
    } else if (ipo.listing_date === "Not yet listed" && openingDate && closingDate) {
      // Not yet listed with dates
      if (now < openingDate) {
        return 'upcoming';
      } else if (now >= openingDate && now <= closingDate) {
        return 'open';
      } else if (now > closingDate) {
        return 'closed';
      }
    }
    
    // Fallback if dates are missing or invalid
    return 'unknown';
  }
}

module.exports = new JsonDataService(); 