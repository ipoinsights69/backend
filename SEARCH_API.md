# IPO Search API Documentation

This document explains how to use the optimized search API for AJAX requests.

## API Endpoint

The search API endpoint is:

```
GET /api/ipos/search?q={search_term}&page={page_number}&limit={results_per_page}
```

### Query Parameters

- `q` (required): Search term (minimum 2 characters)
- `page` (optional): Page number for pagination (default: 1)
- `limit` (optional): Number of results per page (default: 10)

### Response Format

```json
{
  "data": [
    {
      "ipo_id": "2023_company_name",
      "ipo_name": "Company IPO",
      "company_name": "Company Name Ltd",
      "year": 2023,
      "opening_date": "2023-01-15T00:00:00.000Z",
      "closing_date": "2023-01-17T00:00:00.000Z",
      "listing_date": "2023-01-25T00:00:00.000Z",
      "issue_price": "₹500-550",
      "status": "listed",
      "score": 1.5
    }
    // ...more results
  ],
  "page": 1,
  "limit": 10,
  "total": 42,
  "totalPages": 5,
  "query": "company"
}
```

## Using the Helper Utilities

For optimal AJAX performance, use the provided utility functions in `utils/searchUtils.js`.

### 1. Import Utilities

```javascript
import { debounce, searchIPOs } from '../utils/searchUtils';
```

### 2. Example Implementation

```javascript
// For React components
import React, { useState, useCallback } from 'react';
import { debounce, searchIPOs } from '../utils/searchUtils';

function SearchComponent() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ data: [] });
  const [loading, setLoading] = useState(false);

  // Create debounced search function (300ms delay)
  const debouncedSearch = useCallback(
    debounce(async (searchTerm) => {
      if (searchTerm.length >= 2) {
        setLoading(true);
        const searchResults = await searchIPOs(searchTerm);
        setResults(searchResults);
        setLoading(false);
      } else {
        setResults({ data: [] });
      }
    }, 300),
    []
  );

  // Handle input change
  const handleSearchChange = (e) => {
    const value = e.target.value;
    setQuery(value);
    debouncedSearch(value);
  };

  return (
    <div>
      <input
        type="text"
        value={query}
        onChange={handleSearchChange}
        placeholder="Search IPOs..."
        className="search-input"
      />
      
      {loading && <div className="loading-indicator">Searching...</div>}
      
      <div className="search-results">
        {results.data.map(ipo => (
          <div key={ipo.ipo_id} className="search-result-item">
            <h3>{ipo.ipo_name}</h3>
            <p>{ipo.company_name} - {ipo.year}</p>
            <p>Status: {ipo.status}</p>
          </div>
        ))}
        
        {results.data.length === 0 && query.length >= 2 && !loading && (
          <div className="no-results">No results found</div>
        )}
      </div>
    </div>
  );
}
```

### 3. For jQuery Implementation

```javascript
// jQuery example
$(document).ready(function() {
  // Import the debounce function
  const { debounce, searchIPOs } = window.SearchUtils;
  
  // Cache DOM elements
  const $searchInput = $('#search-input');
  const $resultsContainer = $('#search-results');
  const $loadingIndicator = $('#search-loading');
  
  // Create debounced search handler
  const handleSearch = debounce(async function() {
    const query = $searchInput.val().trim();
    
    if (query.length < 2) {
      $resultsContainer.empty();
      return;
    }
    
    $loadingIndicator.show();
    
    try {
      const results = await searchIPOs(query);
      
      // Clear previous results
      $resultsContainer.empty();
      
      if (results.data.length === 0) {
        $resultsContainer.html('<div class="no-results">No results found</div>');
      } else {
        // Render each result
        results.data.forEach(function(ipo) {
          const resultHtml = `
            <div class="search-result-item">
              <h3>${ipo.ipo_name}</h3>
              <p>${ipo.company_name} - ${ipo.year}</p>
              <p>Status: ${ipo.status}</p>
            </div>
          `;
          $resultsContainer.append(resultHtml);
        });
      }
    } catch (error) {
      $resultsContainer.html(`<div class="error">Search error: ${error.message}</div>`);
    } finally {
      $loadingIndicator.hide();
    }
  }, 300);
  
  // Attach event handlers
  $searchInput.on('input', handleSearch);
});
```

## Performance Considerations

1. The search API uses a combination of:
   - MongoDB text search with scoring
   - Server-side caching (5-minute TTL)
   - HTTP caching headers
   - Optimized database queries

2. For best performance:
   - Always use the debounce function to prevent excessive API calls
   - Consider implementing client-side caching for frequent searches
   - Keep the search input field value length requirement (min 2 chars)
   - Handle loading states to improve perceived performance 