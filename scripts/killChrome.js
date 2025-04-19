#!/usr/bin/env node

/**
 * Chrome Process Killer
 * 
 * This script detects the operating system and kills all Google Chrome processes.
 * Useful for cleaning up after scraping sessions or when Chrome processes become stuck.
 */

const { exec } = require('child_process');
const os = require('os');

// Determine operating system
const platform = os.platform();

console.log('🔍 Detecting Chrome processes...');

// Commands for different operating systems
let killCommand;
let checkCommand;

switch (platform) {
  case 'darwin': // macOS
    killCommand = 'pkill -9 "Google Chrome" || pkill -9 "Chrome" || true';
    checkCommand = 'pgrep "Google Chrome" || pgrep "Chrome"';
    break;
  
  case 'linux':
    killCommand = 'pkill -9 chrome || pkill -9 chromium || true';
    checkCommand = 'pgrep chrome || pgrep chromium';
    break;
  
  case 'win32': // Windows
    killCommand = 'taskkill /F /IM chrome.exe /T';
    checkCommand = 'tasklist | findstr chrome.exe';
    break;
  
  default:
    console.error(`❌ Unsupported platform: ${platform}`);
    process.exit(1);
}

// First check if Chrome is running
exec(checkCommand, (error, stdout, stderr) => {
  if (error && !stdout) {
    console.log('✅ No Chrome processes found');
    return;
  }
  
  // If Chrome is running, kill it
  console.log('🚫 Killing Chrome processes...');
  
  exec(killCommand, (error, stdout, stderr) => {
    if (error && platform !== 'win32') {
      // In Unix systems, if no processes are found, pkill returns an error
      // We don't treat this as an actual error, hence the || true in the command
      if (error.code === 1) {
        console.log('✅ No Chrome processes found');
      } else {
        console.error(`❌ Error killing Chrome: ${error.message}`);
      }
      return;
    }
    
    // Verify all processes were killed
    exec(checkCommand, (verifyError, verifyStdout) => {
      if (verifyError || !verifyStdout) {
        console.log('✅ All Chrome processes successfully terminated');
      } else {
        console.warn('⚠️ Some Chrome processes might still be running');
        console.log(verifyStdout);
      }
    });
  });
});

// Also kill Puppeteer-related Chrome instances (they might have different process names)
if (platform === 'darwin') {
  exec('ps aux | grep -i chromium | grep -v grep', (error, stdout) => {
    if (stdout) {
      console.log('🚫 Killing Puppeteer Chromium processes...');
      exec('pkill -9 Chromium || true');
    }
  });
} else if (platform === 'linux') {
  exec('ps aux | grep -i chromium | grep -v grep', (error, stdout) => {
    if (stdout) {
      console.log('🚫 Killing Puppeteer Chromium processes...');
      exec('pkill -9 chromium-browser || true');
    }
  });
} else if (platform === 'win32') {
  exec('tasklist | findstr chromium', (error, stdout) => {
    if (stdout) {
      console.log('🚫 Killing Puppeteer Chromium processes...');
      exec('taskkill /F /IM chromium.exe /T');
    }
  });
} 