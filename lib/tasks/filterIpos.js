/**
 * CPU-intensive task for filtering and analyzing IPOs
 * @param {Object} data - Task parameters
 * @returns {Object} - Filtered and analyzed IPO data
 */
export default async function filterIpos(data) {
  const { ipos, filters, calculations } = data;
  
  // Start timing for performance monitoring
  const startTime = Date.now();
  
  // Apply filters (CPU-intensive part)
  let filteredIpos = ipos;
  
  if (filters) {
    filteredIpos = ipos.filter(ipo => {
      // Apply complex filtering logic
      let include = true;
      
      // Price range filtering
      if (filters.minPrice && (ipo.issue_price_numeric < filters.minPrice)) {
        include = false;
      }
      if (filters.maxPrice && (ipo.issue_price_numeric > filters.maxPrice)) {
        include = false;
      }
      
      // Date range filtering
      if (filters.startDate && new Date(ipo.opening_date) < new Date(filters.startDate)) {
        include = false;
      }
      if (filters.endDate && new Date(ipo.opening_date) > new Date(filters.endDate)) {
        include = false;
      }
      
      // Status filtering
      if (filters.status && ipo.status !== filters.status) {
        include = false;
      }
      
      // Industry filtering
      if (filters.industry && !ipo.industry?.includes(filters.industry)) {
        include = false;
      }
      
      // Custom filter function if provided
      if (filters.customFilter && typeof filters.customFilter === 'string') {
        try {
          // Be careful with eval - this is just an example
          // In production, you would use a sandbox or simply avoid eval
          const customFilter = new Function('ipo', `return ${filters.customFilter}`);
          if (!customFilter(ipo)) {
            include = false;
          }
        } catch (error) {
          console.error('Custom filter error:', error);
        }
      }
      
      return include;
    });
  }
  
  // Apply calculations if requested (CPU-intensive)
  let result = { ipos: filteredIpos };
  
  if (calculations) {
    // Calculate statistics
    const stats = {
      count: filteredIpos.length,
      averagePrice: 0,
      maxPrice: 0,
      minPrice: Number.MAX_VALUE,
      priceDistribution: {},
      oversubscribedCount: 0,
      industryDistribution: {},
    };
    
    // Collect all valid prices
    const prices = filteredIpos
      .map(ipo => ipo.issue_price_numeric)
      .filter(price => !isNaN(price) && price > 0);
    
    // Calculate price statistics
    if (prices.length > 0) {
      stats.averagePrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
      stats.maxPrice = Math.max(...prices);
      stats.minPrice = Math.min(...prices);
      
      // Calculate price distribution
      const priceBuckets = 10;
      const bucketSize = (stats.maxPrice - stats.minPrice) / priceBuckets;
      
      if (bucketSize > 0) {
        prices.forEach(price => {
          const bucketIndex = Math.min(
            priceBuckets - 1,
            Math.floor((price - stats.minPrice) / bucketSize)
          );
          const bucketKey = `${Math.round(stats.minPrice + bucketIndex * bucketSize)}-${Math.round(stats.minPrice + (bucketIndex + 1) * bucketSize)}`;
          stats.priceDistribution[bucketKey] = (stats.priceDistribution[bucketKey] || 0) + 1;
        });
      }
    }
    
    // Calculate oversubscription statistics
    filteredIpos.forEach(ipo => {
      // Count oversubscribed IPOs
      if (ipo.subscription_status?.toLowerCase().includes('oversubscribed') || 
          (ipo.subscription_times && parseFloat(ipo.subscription_times) > 1)) {
        stats.oversubscribedCount++;
      }
      
      // Build industry distribution
      if (ipo.industry) {
        stats.industryDistribution[ipo.industry] = (stats.industryDistribution[ipo.industry] || 0) + 1;
      }
    });
    
    // Add stats to result
    result.stats = stats;
  }
  
  // Add timing information
  result.timing = {
    duration: Date.now() - startTime,
    unit: 'ms'
  };
  
  return result;
} 