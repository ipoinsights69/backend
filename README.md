# IPO Scraper & API

A comprehensive system for scraping, storing, and serving IPO data via a REST API.

## Features

- **Data Scraping**: Fetches IPO listings and detailed data from external sources
- **Data Storage**: Organizes data by year in JSON files and MongoDB
- **API Server**: Provides endpoints to access and search IPO data
- **Extensible**: Easily add new data sources or API endpoints

## Installation

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Copy the environment file and configure it:
   ```
   cp .env.example .env
   ```
4. Edit `.env` with your MongoDB connection string and other configuration values

## Usage

### Running the API Server

```
npm start
```
or
```
node index.js server
```

The server will start on the port specified in your `.env` file (default: 3000).

### Running the Scraper

To scrape IPO data for a specific year or range:

```
node index.js scrape [startYear] [endYear] [saveToMongo]
```

Examples:
- Scrape current year: `node index.js scrape`
- Scrape specific year: `node index.js scrape 2025`
- Scrape year range: `node index.js scrape 2024 2025`
- Scrape and save to MongoDB: `node index.js scrape 2025 2025 --mongo`

Or use npm scripts:
```
npm run scrape
```

### Adding Sample Data

If scraping from the web fails, the system can use sample data files. To add sample data for a specific year:

1. Create a JSON file in the `data` directory named `sample_YEAR_listings.json` (e.g., `sample_2026_listings.json`)
2. Use the following format:
```json
{
  "msg": 1,
  "sSearchWhere": "0",
  "reportTableData": [
    {
      "Company": "<a href=\"URL_TO_IPO_DETAIL_PAGE\" title=\"TITLE\">COMPANY_NAME</a>",
      "Opening Date": "Month Day, Year",
      "Closing Date": "Month Day, Year",
      "Listing Date": "Month Day, Year",
      "Issue Price (Rs)": "PRICE_RANGE",
      "Issue Amount (Rs.cr.)": "AMOUNT",
      "Listing at": "EXCHANGE",
      "Lead Manager": "MANAGER_INFO"
    }
  ]
}
```

## API Endpoints

- `GET /api/ipos`: List all IPOs with pagination
- `GET /api/ipos/:id`: Get IPO by ID
- `GET /api/ipos/year/:year`: Get IPOs by year
- `GET /api/ipos/search?q=query`: Search IPOs by query
- `POST /api/ipos/refresh/:id`: Refresh data for a specific IPO (admin only)
- `POST /api/ipos/fetch-year/:year`: Fetch and store new IPOs for a year (admin only)

## Project Structure

```
- /config            # Configuration files
- /models            # MongoDB data models
- /routes            # API route handlers
- /scraper           # Scraper modules
- /scripts           # Utility scripts
- /utils             # Helper utilities
- /data              # Scraped data (JSON files)
- server.js          # API server implementation
- index.js           # Main entry point
```

## Development

### Adding New API Endpoints

1. Add new routes to `/routes/ipoRoutes.js`
2. Update API documentation in this README

### Extending the Scraper

1. Add new scraper modules to `/scraper/`
2. Integrate with existing pipeline in `/scripts/scrapeIpos.js`

## License

MIT 

## MongoDB Integration

The system can store and retrieve IPO data from MongoDB for faster access and enhanced querying capabilities.

### Uploading Data to MongoDB

To upload existing JSON data to MongoDB:

```bash
# Upload all years
npm run upload-mongo all

# Upload a specific year
npm run upload-mongo 2023

# Upload a year range
npm run upload-mongo 2023 2025

# Upload with overwrite option
npm run upload-mongo 2023 --overwrite

# Control batch size for optimized performance
npm run upload-mongo all --batch-size 5
```

### Scraping and Uploading Simultaneously

To scrape data and upload to MongoDB in one operation:

```bash
# Scrape current year and upload to MongoDB
node index.js scrape --mongo

# Scrape specific year and upload to MongoDB
node index.js scrape 2023 2023 --mongo
```

## Cron Jobs

The system includes a cron job manager to automate scraping and uploading tasks.

### Configuring Cron Jobs

```bash
# List all configured cron jobs
npm run cron:list

# Add a new cron job (format: ID, SCHEDULE, TASK, YEAR, [CONCURRENCY])
node scripts/cronManager.js add daily-2023 "0 0 * * *" scrape-and-upload 2023 3

# Enable a cron job
node scripts/cronManager.js enable daily-2023

# Disable a cron job
node scripts/cronManager.js disable daily-2023

# Remove a cron job
node scripts/cronManager.js remove daily-2023

# Run a cron job immediately
node scripts/cronManager.js run-now daily-2023
```

### Starting the Cron Service

```bash
# Start all enabled cron jobs
npm run cron:start
```

## Next.js API Integration

The system includes optimized Next.js API routes with built-in caching for efficient data retrieval.

### Starting the Next.js Server

```bash
# Development mode
npm run next-dev

# Production build
npm run build
npm start
```

### Available API Endpoints

- `GET /api/ipos` - List all IPOs with pagination and filtering
- `GET /api/ipos/[id]` - Get a specific IPO by ID
- `GET /api/ipos/year/[year]` - Get all IPOs for a specific year
- `GET /api/ipos/search?q=query` - Search IPOs by keyword
- `GET /api/ipos/stats` - Get overall IPO statistics

### API Query Parameters

- `page` - Page number for pagination (default: 1)
- `limit` - Number of items per page (default: 10)
- `sort` - Sort field (prefix with - for descending, e.g., -opening_date)
- `status` - Filter by IPO status
- `year` - Filter by IPO year
- `minPrice` - Filter by minimum issue price
- `maxPrice` - Filter by maximum issue price

## Performance Optimization

To run the system on limited resources:

1. Configure resource limits in `.env`:
   ```
   MEMORY_LIMIT=512
   DB_POOL_SIZE=10
   MAX_CONCURRENT_REQUESTS=2
   ```

2. Use optimized APIs with caching:
   ```
   API_CACHE_TIME=300
   ```

3. Run scraping with reduced concurrency:
   ```
   node index.js scrape 2023 2023 --mongo --concurrency 1
   ```

4. Monitor resource usage during operation and adjust as needed. 