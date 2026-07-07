/**
 * routes/distributorRoutes.js  —  /api/distributor/* endpoints
 *
 * New, separate module — does not touch /api/invoice/* (existing tracking
 * routes remain completely unchanged).
 *
 *   POST /api/distributor/login                body: { distributorCode }
 *   GET  /api/distributor/:code/summary
 *   GET  /api/distributor/:code/invoices?page=&limit=
 */

const express = require('express');
const router  = express.Router();
const logger  = require('../utils/logger');
const {
  isValidDistributorCode,
  getDistributorSummary,
  getPaginatedInvoices,
} = require('../services/distributorPortalService');

function notFound(res, code) {
  return res.status(404).json({
    error:   'DISTRIBUTOR_NOT_FOUND',
    message: `Distributor code "${code}" was not found. Check the code and try again.`,
  });
}

// ─── POST /api/distributor/login ──────────────────────────────────────────────

router.post('/login', async (req, res) => {
  try {
    const code = String(req.body?.distributorCode || '').trim();
    if (!code) {
      return res.status(400).json({ error: 'MISSING_CODE', message: 'distributorCode is required.' });
    }
    if (!isValidDistributorCode(code)) {
      logger.info(`Distributor login failed: "${code}" not found`);
      return notFound(res, code);
    }

    const summary = await getDistributorSummary(code);
    logger.info(`Distributor login: ${code} (${summary.totalActiveInvoices} active invoices)`);
    res.json({ success: true, ...summary });
  } catch (err) {
    logger.error('POST /api/distributor/login error: ' + err.message);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' });
  }
});

// ─── GET /api/distributor/:code/summary ───────────────────────────────────────

router.get('/:code/summary', async (req, res) => {
  try {
    const code = String(req.params.code || '').trim();
    if (!isValidDistributorCode(code)) return notFound(res, code);
    res.json(await getDistributorSummary(code));
  } catch (err) {
    logger.error('GET /api/distributor/:code/summary error: ' + err.message);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' });
  }
});

// ─── GET /api/distributor/:code/invoices ──────────────────────────────────────

router.get('/:code/invoices', async (req, res) => {
  try {
    const code = String(req.params.code || '').trim();
    if (!isValidDistributorCode(code)) return notFound(res, code);

    const { page, limit } = req.query;
    res.json(await getPaginatedInvoices(code, page, limit));
  } catch (err) {
    logger.error('GET /api/distributor/:code/invoices error: ' + err.message);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' });
  }
});

module.exports = router;
