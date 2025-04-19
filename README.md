# IPO Scraper and API

A comprehensive solution for scraping, managing, and serving IPO (Initial Public Offering) data via RESTful APIs.

## Features

- **IPO Data Scraping**: Automated scraping of IPO information from financial websites
- **Cron Job Management**: Schedule and manage automatic data updates
- **RESTful API**: Well-documented endpoints for consuming IPO data
- **Database Integration**: MongoDB storage with efficient indexing
- **Logging System**: Comprehensive logging for tracking operations

## Tech Stack

- **Backend**: Node.js + Express.js
- **Database**: MongoDB with Mongoose ODM
- **Scraping**: Axios + Cheerio
- **Scheduling**: Node-cron for scheduled tasks
- **Security**: Helmet, CORS, Rate-limiting

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/ipo-scraper.git
   cd ipo-scraper
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. Start the application:
   ```bash
   npm start
   ```

## API Endpoints

### Public Endpoints

- `GET /api/ipos` - Get all IPOs with pagination, filtering and sorting
- `GET /api/ipos/search` - Search IPOs by query
- `GET /api/ipos/:id` - Get IPO by ID
- `GET /api/ipos/ids` - Get all IPO IDs
- `GET /api/ipos/years` - Get years with IPO data
- `GET /api/ipos/status/:status` - Get IPOs by status
- `GET /api/health` - Server health check

## Scripting

The project includes several utility scripts:

- **Scraping Script**: `node scripts/scrapeIpos.js <year> [saveToDb] [overwrite]`
  - Example: `node scripts/scrapeIpos.js 2023 true false`

- **Start Development Server**: `npm run dev`
  - Starts server with hot reloading

## Cron Jobs

The system supports scheduled tasks using cron jobs. Default jobs are configured during server startup.

```json
{
  "name": "daily-ipo-update",
  "schedule": "30 20 * * *",
  "command": "scrape",
  "args": ["2023", "true", "false"],
  "active": true
}
```

## Project Structure

```
ipo-scraper/
├── config/             # Configuration files
├── models/             # MongoDB models
├── routes/             # API routes
│   └── api/            # API endpoint definitions
├── scripts/            # Utility scripts
├── utils/              # Helper utilities
├── logs/               # Log files (generated)
├── data/               # Scraped data storage (generated)
├── .env                # Environment variables
├── .env.example        # Example environment file
├── express-server.js   # Main server file
└── package.json        # Node.js dependencies
```

## Development

### Prerequisites

- Node.js (v14+)
- MongoDB (v4+)

### Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start MongoDB (if not using a remote instance):
   ```bash
   mongod --dbpath=./data/db
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

## Scraping for Future Years (e.g., 2025)

To scrape IPO data for future years like 2025, follow these steps:

### Method 1: Using the scrape.js Script

The `scrape.js` script has been updated to handle future years with the `--force` flag:

```bash
# Scrape 2025 IPOs and save to database
npm run scrape -- 2025 true --force

# Scrape 2025 IPOs but don't save to database (just save to JSON)
npm run scrape -- 2025 false --force
```

### Method 2: Manual Scraping and Uploading

If you prefer more control, you can perform these steps manually:

1. First, scrape the IPO listings for 2025:
```bash
node scripts/scrapeIpos.js 2025 false --force
```

2. This will create JSON files in the `data/2025/` directory.

3. Then, upload the data to MongoDB:
```bash
node scripts/uploadToMongo.js --year=2025 --overwrite=false
```

4. Update the performance metrics:
```bash
node scripts/updateListingGains.js
```

### Understanding the Data

The scraped data will be saved in both:
- JSON files in the `data/2025/` directory
- MongoDB database (if you chose to save to DB)

For future years like 2025, note that:
- The data might be incomplete as IPOs are still being announced
- Status will typically be "upcoming" for most entries
- Listing dates and performance metrics might not be available yet

### Updating the Data

To keep your 2025 IPO data current, run the scraper periodically:

```bash
# Daily update 
npm run cron -- run-now daily-ipo-update
```

You can also set up a cron job to run automatically:

```bash
# Set up daily job for 2025 data
node scripts/cronManager.js add --id="daily-2025-update" --schedule="30 20 * * *" --task="scrape-and-upload" --options='{"year":2025,"concurrency":2,"saveToMongo":true,"overwrite":false}'

# Enable the job
node scripts/cronManager.js enable --id="daily-2025-update"
```

## License

MIT 