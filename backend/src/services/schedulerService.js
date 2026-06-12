const cron = require('node-cron');
const logger = require('../utils/logger');
const { runFetch, isSessionExpired } = require('./fetchService');

const VALID_INTERVALS = [10, 15, 20, 30, 60];

let currentJob = null;
let currentInterval = 10;

function intervalToCron(minutes) {
  if (!VALID_INTERVALS.includes(minutes)) {
    logger.warn(`Invalid interval ${minutes}, defaulting to 10 minutes`);
    minutes = 10;
  }

  if (minutes === 60) return '0 * * * *';         // Every hour
  return `*/${minutes} * * * *`;                   // Every N minutes
}

function startScheduler(intervalMinutes) {
  const interval = parseInt(intervalMinutes) || parseInt(process.env.FETCH_INTERVAL) || 10;
  currentInterval = interval;

  if (currentJob) {
    currentJob.stop();
    logger.info('Stopped previous scheduler');
  }

  const cronExpr = intervalToCron(interval);
  logger.info(`Starting scheduler with interval: every ${interval} minutes (cron: ${cronExpr})`);

  currentJob = cron.schedule(cronExpr, async () => {
    if (isSessionExpired()) {
      logger.warn('Scheduler: Session expired - skipping scheduled fetch');
      return;
    }
    logger.info('Scheduler: Running scheduled fetch');
    await runFetch();
  });

  return { interval, cronExpr };
}

function stopScheduler() {
  if (currentJob) {
    currentJob.stop();
    currentJob = null;
    logger.info('Scheduler stopped');
  }
}

function getSchedulerStatus() {
  return {
    running: !!currentJob,
    interval: currentInterval,
    cronExpr: intervalToCron(currentInterval)
  };
}

module.exports = { startScheduler, stopScheduler, getSchedulerStatus, VALID_INTERVALS };
