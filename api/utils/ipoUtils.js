/**
 * Helper functions for processing IPO data
 */

/**
 * Calculate performance score based on listing gains and other metrics
 * @param {Object} ipo - IPO document
 * @returns {Number} - Performance score (0-100)
 */
const calculatePerformanceScore = (ipo) => {
  // Extract numeric listing gains if available
  let listingGainValue = 0;
  if (ipo.listing_gains) {
    const match = ipo.listing_gains.match(/([+-]?\d+(?:\.\d+)?)/);
    if (match) {
      listingGainValue = parseFloat(match[1]);
    }
  }

  // Define weights for different metrics
  const metrics = {
    listingGain: {
      value: listingGainValue,
      weight: 0.7,  // 70% weight to listing gains
      scale: (val) => {
        if (val >= 100) return 100;
        if (val >= 50) return 90 + (val - 50) * 0.2;
        if (val >= 20) return 70 + (val - 20) * 0.67;
        if (val >= 0) return 50 + val * 1;
        if (val >= -20) return 50 + val * 2.5;
        return Math.max(0, 50 + val * 2.5);
      }
    },
    // Add other metrics here as needed
    // subscriptionRate: { value: ipo.subscription_rate, weight: 0.2, scale: ... },
    // marketCap: { value: ipo.market_cap, weight: 0.1, scale: ... }
  };

  // Calculate weighted score
  let totalScore = 0;
  let totalWeight = 0;

  for (const [key, metric] of Object.entries(metrics)) {
    if (metric.value !== undefined && metric.value !== null) {
      const scaledValue = metric.scale(metric.value);
      totalScore += scaledValue * metric.weight;
      totalWeight += metric.weight;
    }
  }

  // Return normalized score (0-100)
  return totalWeight > 0 ? Math.round(totalScore / totalWeight) : null;
};

/**
 * Calculate listing gains for IPO from listingDayTrading data
 * @param {Object} ipo - IPO document with listingDayTrading data
 * @returns {Object} - Object with calculated listing gains
 */
const calculateListingGains = (ipo) => {
  if (!ipo.listingDayTrading || !ipo.listingDayTrading.data) {
    return {
      listing_gains: null,
      listing_gains_numeric: null,
      listing_gains_by_exchange: null
    };
  }

  const { data } = ipo.listingDayTrading;
  const result = {
    listing_gains: null,
    listing_gains_numeric: null,
    listing_gains_by_exchange: {}
  };

  // Process each exchange that has data
  const exchanges = [];
  
  // Check for standard exchange keys (bse, nse)
  if (data.final_issue_price && data.last_trade) {
    const exchangeKeys = Object.keys(data.final_issue_price);
    
    exchangeKeys.forEach(exchange => {
      const issuePrice = parseFloat(data.final_issue_price[exchange]);
      const lastTradePrice = parseFloat(data.last_trade[exchange]);
      
      if (!isNaN(issuePrice) && !isNaN(lastTradePrice) && issuePrice > 0) {
        const listingGain = ((lastTradePrice - issuePrice) / issuePrice) * 100;
        const roundedGain = Math.round(listingGain * 100) / 100;
        
        result.listing_gains_by_exchange[exchange] = {
          issuePrice,
          lastTradePrice,
          gain: roundedGain,
          gainFormatted: `${roundedGain > 0 ? '+' : ''}${roundedGain.toFixed(2)}%`
        };
        
        exchanges.push({
          exchange,
          gain: roundedGain
        });
      }
    });
  }
  
  // If there are calculated gains, choose the primary one for display
  if (exchanges.length > 0) {
    // Prioritize NSE over BSE if both are available
    let primaryExchange = exchanges.find(e => e.exchange === 'nse') || exchanges[0];
    
    result.listing_gains_numeric = primaryExchange.gain;
    result.listing_gains = `${primaryExchange.gain > 0 ? '+' : ''}${primaryExchange.gain.toFixed(2)}%`;
  }
  
  return result;
};

/**
 * Extract numeric value from price string
 * @param {String} priceString - Price string (e.g., "₹140" or "₹304 to ₹321 per share")
 * @returns {Number|String|null} - Numeric value, range string like "304-321", or null if extraction fails
 */
const extractNumericPrice = (priceString) => {
  // Check if priceString is null, undefined, or not a string
  if (!priceString || typeof priceString !== 'string') {
    console.log(`Invalid priceString received: ${priceString} (type: ${typeof priceString})`);
    return null;
  }

  // Check if it's already in a standard format like "304-321"
  if (priceString.includes('-')) {
    const parts = priceString.split('-');
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return priceString;
    }
  }

  // Handle price ranges with "to", "–", "—", "-" or similar separators
  if (priceString.includes('to') || priceString.includes('–') || priceString.includes('—')) {
    const matches = priceString.match(/\d+(?:\.\d+)?/g);
    if (matches && matches.length >= 2) {
      return `${matches[0]}-${matches[1]}`;
    }
  }

  // Extract single price
  const match = priceString.match(/\d+(?:\.\d+)?/);
  return match ? match[0] : null;
};

/**
 * Determine IPO status based on dates
 * @param {Object} ipo - IPO document with date fields
 * @returns {String} - Status (upcoming, open, closed, listed, unknown)
 */
const determineIpoStatus = (ipo) => {
  const now = new Date();
  
  // Parse dates safely
  const openingDate = ipo.opening_date ? new Date(ipo.opening_date) : null;
  const closingDate = ipo.closing_date ? new Date(ipo.closing_date) : null;
  const listingDate = ipo.listing_date ? new Date(ipo.listing_date) : null;

  // Handle invalid dates
  if (openingDate && isNaN(openingDate.getTime())) return 'unknown';
  if (closingDate && isNaN(closingDate.getTime())) return 'unknown';
  if (listingDate && isNaN(listingDate.getTime())) return 'unknown';
  
  // Determine status based on dates
  if (openingDate && now < openingDate) {
    return 'upcoming';
  } else if (openingDate && closingDate && now >= openingDate && now <= closingDate) {
    return 'open';
  } else if (closingDate && listingDate && now > closingDate && now < listingDate) {
    return 'closed';
  } else if (listingDate && now >= listingDate) {
    return 'listed';
  }
  
  // Fallback if dates are missing or invalid
  return 'unknown';
};

/**
 * Generate consistent IPO ID from company name and year
 * @param {Object} ipo - IPO document
 * @returns {String} - Generated IPO ID
 */
const generateIpoId = (ipo) => {
  if (!ipo.company_name || !ipo.year) {
    return null;
  }
  
  return `${ipo.year}_${ipo.company_name.toLowerCase().replace(/\s+/g, '_')}`;
};

/**
 * Enrich IPO document with computed fields
 * @param {Object} ipo - Raw IPO document
 * @returns {Object} - Enriched IPO document
 */
const enrichIpoDocument = (ipo) => {
  const enriched = { ...ipo };
  
  // Add ipo_id if not present
  if (!enriched.ipo_id) {
    enriched.ipo_id = generateIpoId(enriched);
  }
  
  // Add ipo_name if not present (used for display purposes)
  if (!enriched.ipo_name) {
    enriched.ipo_name = `${enriched.company_name} IPO`;
  }
  
  // Extract numeric price
  if (enriched.issue_price && !enriched.issue_price_numeric) {
    enriched.issue_price_numeric = extractNumericPrice(enriched.issue_price);
  }
  
  // Determine status
  if (!enriched.status) {
    enriched.status = determineIpoStatus(enriched);
  }
  
  // Calculate performance score
  if (enriched.listing_gains && !enriched.performance_score) {
    enriched.performance_score = calculatePerformanceScore(enriched);
  }
  
  return enriched;
};

// Export functions
module.exports = {
  calculatePerformanceScore,
  calculateListingGains,
  extractNumericPrice,
  determineIpoStatus,
  generateIpoId,
  enrichIpoDocument
}; 