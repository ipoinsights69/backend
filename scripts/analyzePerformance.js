/**
 * Performance Analysis Script
 * Monitors and analyzes API performance metrics
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
require('dotenv').config();

// Constants
const LOG_DIR = path.join(__dirname, '..', 'logs');
const REPORT_DIR = path.join(__dirname, '..', 'reports');

// Ensure report directory exists
if (!fs.existsSync(REPORT_DIR)) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
}

/**
 * Extract API response times from logs
 */
function analyzeResponseTimes() {
  try {
    // Find the most recent access log
    const logFiles = fs.readdirSync(LOG_DIR)
      .filter(file => file.startsWith('access'))
      .map(file => path.join(LOG_DIR, file));
    
    if (logFiles.length === 0) {
      console.log('No access logs found');
      return {};
    }
    
    // Sort by modification time (newest first)
    logFiles.sort((a, b) => {
      return fs.statSync(b).mtime.getTime() - fs.statSync(a).mtime.getTime();
    });
    
    const latestLog = logFiles[0];
    console.log(`Analyzing response times from ${latestLog}`);
    
    // Read the log file and parse response times
    const log = fs.readFileSync(latestLog, 'utf8');
    const lines = log.split('\n').filter(line => line.trim());
    
    // Extract response time using regex
    const responseTimes = [];
    const endpointTimes = {};
    
    lines.forEach(line => {
      // Parse morgan combined format with response time
      const match = line.match(/"([A-Z]+) ([^"]+) HTTP\/[\d.]+".+?(\d+)ms$/);
      if (match) {
        const method = match[1];
        const url = match[2];
        const time = parseInt(match[3], 10);
        
        if (!isNaN(time)) {
          responseTimes.push(time);
          
          // Group by endpoint
          const endpoint = url.split('?')[0]; // Remove query params
          if (!endpointTimes[endpoint]) {
            endpointTimes[endpoint] = [];
          }
          endpointTimes[endpoint].push(time);
        }
      }
    });
    
    if (responseTimes.length === 0) {
      console.log('No response time data found in logs');
      return {};
    }
    
    // Calculate statistics
    const stats = {
      totalRequests: responseTimes.length,
      averageResponseTime: Math.round(responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length),
      minResponseTime: Math.min(...responseTimes),
      maxResponseTime: Math.max(...responseTimes),
      medianResponseTime: calculateMedian(responseTimes),
      p95ResponseTime: calculatePercentile(responseTimes, 95),
      endpoints: {}
    };
    
    // Calculate stats for each endpoint
    Object.keys(endpointTimes).forEach(endpoint => {
      const times = endpointTimes[endpoint];
      stats.endpoints[endpoint] = {
        requests: times.length,
        average: Math.round(times.reduce((sum, time) => sum + time, 0) / times.length),
        min: Math.min(...times),
        max: Math.max(...times),
        p95: calculatePercentile(times, 95)
      };
    });
    
    return stats;
  } catch (error) {
    console.error('Error analyzing response times:', error);
    return {};
  }
}

/**
 * Calculate median value from array
 */
function calculateMedian(values) {
  if (values.length === 0) return 0;
  
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[middle - 1] + sorted[middle]) / 2);
  } else {
    return sorted[middle];
  }
}

/**
 * Calculate percentile value
 */
function calculatePercentile(values, percentile) {
  if (values.length === 0) return 0;
  
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(sorted.length * (percentile / 100)) - 1;
  return sorted[index];
}

/**
 * Get system metrics
 */
function getSystemMetrics() {
  try {
    // Get memory usage of Node process
    const memoryUsage = process.memoryUsage();
    
    let cpuUsage;
    if (process.platform === 'linux') {
      // Use top to get CPU usage on Linux
      const topOutput = execSync('top -b -n 1').toString();
      const cpuLine = topOutput.split('\n').find(line => line.includes('Cpu(s)'));
      if (cpuLine) {
        const cpuMatch = cpuLine.match(/(\d+\.\d+)%?\s+us/);
        cpuUsage = cpuMatch ? parseFloat(cpuMatch[1]) : null;
      }
    } else if (process.platform === 'darwin') {
      // MacOS
      try {
        const output = execSync('ps -A -o %cpu | awk \'{s+=$1} END {print s}\'').toString().trim();
        cpuUsage = parseFloat(output);
      } catch (e) {
        cpuUsage = null;
      }
    }
    
    return {
      memory: {
        rss: Math.round(memoryUsage.rss / 1024 / 1024), // MB
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
        external: Math.round(memoryUsage.external / 1024 / 1024) // MB
      },
      cpu: cpuUsage,
      processUptime: Math.floor(process.uptime())
    };
  } catch (error) {
    console.error('Error getting system metrics:', error);
    return {};
  }
}

/**
 * Generate and save performance report
 */
function generateReport() {
  const report = {
    timestamp: new Date().toISOString(),
    responseTimes: analyzeResponseTimes(),
    systemMetrics: getSystemMetrics()
  };
  
  // Save report to file
  const reportPath = path.join(REPORT_DIR, `performance-${new Date().toISOString().split('T')[0]}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  // Print summary
  console.log('\n===== Performance Analysis =====');
  console.log(`Generated at: ${report.timestamp}`);
  
  if (report.responseTimes.totalRequests) {
    console.log('\n--- API Response Times ---');
    console.log(`Total Requests: ${report.responseTimes.totalRequests}`);
    console.log(`Average Response Time: ${report.responseTimes.averageResponseTime}ms`);
    console.log(`95th Percentile: ${report.responseTimes.p95ResponseTime}ms`);
    console.log(`Min/Max: ${report.responseTimes.minResponseTime}ms / ${report.responseTimes.maxResponseTime}ms`);
    
    console.log('\n--- Top 5 Slowest Endpoints ---');
    const endpoints = Object.entries(report.responseTimes.endpoints)
      .sort((a, b) => b[1].average - a[1].average)
      .slice(0, 5);
    
    endpoints.forEach(([endpoint, stats]) => {
      console.log(`${endpoint}: ${stats.average}ms avg, ${stats.requests} requests`);
    });
  }
  
  console.log('\n--- System Metrics ---');
  console.log(`Memory Usage: ${report.systemMetrics.memory?.rss}MB RSS, ${report.systemMetrics.memory?.heapUsed}MB Heap`);
  
  if (report.systemMetrics.cpu) {
    console.log(`CPU Usage: ${report.systemMetrics.cpu}%`);
  }
  
  console.log(`Process Uptime: ${formatUptime(report.systemMetrics.processUptime)}`);
  console.log('\nFull report saved to:', reportPath);
  console.log('================================\n');
  
  return report;
}

/**
 * Format uptime in human-readable format
 */
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
  
  return parts.join(' ');
}

// Run the analysis
if (require.main === module) {
  generateReport();
}

module.exports = {
  analyzeResponseTimes,
  getSystemMetrics,
  generateReport
}; 