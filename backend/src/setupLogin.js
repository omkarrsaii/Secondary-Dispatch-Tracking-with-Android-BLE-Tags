require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { setupLogin } = require('./services/browserService');
const logger = require('./utils/logger');

async function main() {
  // Clean up old session artifacts
  const profileDir = path.resolve(process.env.CHROME_PROFILE_DIR || './data/chrome-profile');
  const oldSession = path.resolve(process.env.SESSION_FILE || './data/storageState.json');
  const readyFile = path.join(profileDir, '.login-complete');

  if (fs.existsSync(oldSession)) {
    fs.unlinkSync(oldSession);
    logger.info('Removed old storageState.json.');
  }
  if (fs.existsSync(readyFile)) {
    fs.unlinkSync(readyFile);
    logger.info('Removed old login marker — starting fresh.');
  }

  logger.info('Profile directory: ' + profileDir);

  try {
    await setupLogin();
    logger.info('');
    logger.info('✓ Login complete! Run: npm start');
    process.exit(0);
  } catch (err) {
    logger.error('Setup failed: ' + err.message);
    process.exit(1);
  }
}

main();
