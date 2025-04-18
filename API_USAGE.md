# Admin API Documentation

This document explains how to use the admin API endpoints for the IPO Scraper application.

## Authentication

All admin API endpoints are protected with token-based authentication. You need to include the token in the `Authorization` header:

```
Authorization: Bearer your-secure-token-here
```

The token value should match the `ADMIN_API_TOKEN` value in your environment variables.

## Endpoints

### Data Operations

**URL:** `/api/admin/data-operations`
**Method:** `POST`
**Description:** Initiates a data operation (scraping or uploading)

**Request Body:**

```json
{
  "operation": "scrape-and-upload", // Options: "scrape", "upload", "scrape-and-upload"
  "year": 2024, // Year to scrape/upload
  "threads": 5, // Number of concurrent threads for scraping (optional, default: 5)
  "overwrite": false // Whether to overwrite existing data (optional, default: false)
}
```

**Response Example (Success):**

```json
{
  "message": "Scrape and Upload operation for year 2024 started successfully",
  "operationId": "1714567890123",
  "operation": "scrape-and-upload",
  "year": 2024,
  "status": "processing",
  "statusEndpoint": "/api/admin/operation-status?operationId=1714567890123",
  "logsEndpoint": "/api/admin/operation-logs?operationId=1714567890123"
}
```

### Operation Status

**URL:** `/api/admin/operation-status`
**Method:** `GET`
**Description:** Checks the status of a running or completed operation

**Query Parameters:**
- `operationId`: The ID of the operation to check

**Response Example (Processing):**

```json
{
  "operationId": "1714567890123",
  "status": "processing",
  "result": {
    "command": "node scripts/scrapeIpos.js --year 2024 --threads 5 && node scripts/uploadToMongo.js --year 2024",
    "operation": "scrape-and-upload",
    "year": 2024,
    "startedAt": "2023-05-01T10:30:45.123Z"
  },
  "updatedAt": "2023-05-01T10:30:45.123Z"
}
```

**Response Example (Completed):**

```json
{
  "operationId": "1714567890123",
  "status": "completed",
  "result": {
    "exitCode": 0,
    "completedAt": "2023-05-01T10:35:12.456Z"
  },
  "updatedAt": "2023-05-01T10:35:12.456Z"
}
```

### Operation Logs

**URL:** `/api/admin/operation-logs`
**Method:** `GET`
**Description:** Retrieves real-time logs for an operation

**Query Parameters:**
- `operationId`: The ID of the operation to get logs for (required)
- `since`: Optional timestamp to get only logs newer than this time

**Response Example:**

```json
{
  "operationId": "1714567890123",
  "count": 3,
  "logs": [
    {
      "timestamp": "2023-05-01T10:30:45.123Z",
      "message": "Starting Scrape and Upload operation for year 2024"
    },
    {
      "timestamp": "2023-05-01T10:30:45.456Z",
      "message": "Executing command: node scripts/scrapeIpos.js --year 2024 --threads 5 && node scripts/uploadToMongo.js --year 2024"
    },
    {
      "timestamp": "2023-05-01T10:31:02.789Z",
      "message": "Found 120 IPOs for 2024..."
    }
  ],
  "nextPoll": "2023-05-01T10:31:02.789Z"
}
```

**Polling for Real-time Updates:**
To continuously get new logs, use the `nextPoll` value from the response as the `since` parameter in your next request:

```
/api/admin/operation-logs?operationId=1714567890123&since=2023-05-01T10:31:02.789Z
```

## Example Usage with cURL

### Trigger a scrape and upload operation:

```bash
curl -X POST \
  http://localhost:3000/api/admin/data-operations \
  -H 'Authorization: Bearer your-secure-token-here' \
  -H 'Content-Type: application/json' \
  -d '{
    "operation": "scrape-and-upload",
    "year": 2024
  }'
```

### Check operation status:

```bash
curl -X GET \
  'http://localhost:3000/api/admin/operation-status?operationId=1714567890123' \
  -H 'Authorization: Bearer your-secure-token-here'
```

### Get operation logs:

```bash
curl -X GET \
  'http://localhost:3000/api/admin/operation-logs?operationId=1714567890123' \
  -H 'Authorization: Bearer your-secure-token-here'
```

### Get only new logs since a specific time:

```bash
curl -X GET \
  'http://localhost:3000/api/admin/operation-logs?operationId=1714567890123&since=2023-05-01T10:31:02.789Z' \
  -H 'Authorization: Bearer your-secure-token-here'
```

## Security Notes

1. Always use HTTPS in production to protect your API token
2. Generate a strong, random token (at least 32 characters)
3. Consider implementing rate limiting for these endpoints
4. Review logs periodically for unauthorized access attempts 