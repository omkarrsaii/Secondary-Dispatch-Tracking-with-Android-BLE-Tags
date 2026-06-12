/**
 * sheetsService.js
 *
 * Google Sheets API client — server-to-server auth via Service Account.
 *
 * ROOT CAUSE FIX (Issue 1):
 *   dotenv does NOT trim leading/trailing spaces from values, so:
 *     GOOGLE_SERVICE_ACCOUNT_KEY= ./data/service-account-key.json
 *   becomes the string " ./data/service-account-key.json" in process.env.
 *   path.resolve() with a space-prefixed relative path produces an invalid
 *   path → fs.existsSync() returns false → isConfigured() returns false.
 *
 *   Fix: every env var read goes through trimEnv() before use.
 *   isConfigured() also logs exactly which check failed so you can diagnose.
 */

const { google } = require('googleapis');
const path   = require('path');
const fs     = require('fs');
const logger = require('../utils/logger');

// ─── Safe env reader (trims whitespace from all values) ──────────────────────

function trimEnv(key, defaultVal = '') {
  const val = process.env[key];
  return val !== undefined ? String(val).trim() : defaultVal;
}

// Debug: log trimmed env values to help diagnose .env loading issues
try {
  logger.info(
    `sheetsService (debug): INVOICE_SHEET_ID="${trimEnv('INVOICE_SHEET_ID')}", ` +
    `VEHICLE_SHEET_ID="${trimEnv('VEHICLE_SHEET_ID')}", ` +
    `GOOGLE_SERVICE_ACCOUNT_KEY="${trimEnv('GOOGLE_SERVICE_ACCOUNT_KEY')}"`
  );
} catch (e) {
  // swallow logging errors
}

// ─── Path helpers ─────────────────────────────────────────────────────────────

function getKeyFilePath() {
  const raw = trimEnv('GOOGLE_SERVICE_ACCOUNT_KEY', './data/service-account-key.json');
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

// ─── Auth singleton ───────────────────────────────────────────────────────────

let _authClient = null;

async function getAuthClient() {
  if (_authClient) return _authClient;

  const keyFile = getKeyFilePath();
  if (!fs.existsSync(keyFile)) {
    throw new Error(
      `Service account key not found at "${keyFile}". ` +
      `Download the JSON key from Google Cloud Console and place it there.`
    );
  }

  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  _authClient = await auth.getClient();
  logger.info('sheetsService: auth client initialised');
  return _authClient;
}

// ─── isConfigured — logs exactly which check failed ──────────────────────────

function isConfigured() {
  const keyPath   = getKeyFilePath();
  const hasKey    = fs.existsSync(keyPath);
  const invoiceId = trimEnv('INVOICE_SHEET_ID');
  const vehicleId = trimEnv('VEHICLE_SHEET_ID');

  if (!hasKey)    logger.warn(`sheetsService: key file not found at "${keyPath}"`);
  if (!invoiceId) logger.warn('sheetsService: INVOICE_SHEET_ID is empty or not set in .env');
  if (!vehicleId) logger.warn('sheetsService: VEHICLE_SHEET_ID is empty or not set in .env');

  return hasKey && !!invoiceId && !!vehicleId;
}

// ─── Core row fetcher ─────────────────────────────────────────────────────────

function quoteSheetNameForRange(tabName) {
  const raw = String(tabName || '').trim();
  if (!raw) return raw;

  const [sheetName, range] = raw.split('!', 2);
  const quotedSheetName = sheetName.startsWith("'") && sheetName.endsWith("'")
    ? sheetName
    : `'${sheetName.replace(/'/g, "''")}'`;

  return range ? `${quotedSheetName}!${range}` : quotedSheetName;
}

async function fetchSheetRows(spreadsheetId, tabName) {
  const authClient = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth: authClient });
  const range = quoteSheetNameForRange(tabName.trim());

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadsheetId.trim(),
    range,
  });

  const rows = response.data.values || [];
  logger.info(`sheetsService: fetched ${rows.length} rows from "${tabName}"`);
  return rows;
}

async function getSheetTitles(spreadsheetId) {
  const authClient = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth: authClient });
  const response = await sheets.spreadsheets.get({
    spreadsheetId: spreadsheetId.trim(),
    fields: 'sheets.properties.title',
  });
  return response.data.sheets.map(s => String(s.properties.title || '').trim()).filter(Boolean);
}

async function fetchSheetRowsWithTabFallback(spreadsheetId, preferredTabName, requiredHeaderPartials = []) {
  const trimmedTab = String(preferredTabName || '').trim();
  const tried = [];

  const candidates = [];
  if (trimmedTab) candidates.push(trimmedTab);

  const actualTitles = await getSheetTitles(spreadsheetId);
  for (const title of actualTitles) {
    if (!candidates.includes(title)) candidates.push(title);
  }

  for (const tab of candidates) {
    if (!tab) continue;
    try {
      const rows = await fetchSheetRows(spreadsheetId, tab);
      tried.push(tab);
      if (rows.length === 0) {
        logger.warn(`sheetsService: sheet "${tab}" is empty; trying next tab`);
        continue;
      }

      if (requiredHeaderPartials.length === 0) {
        return { rows, tab };
      }

      const found = findHeaderRow(rows, ...requiredHeaderPartials);
      if (found) {
        return { rows, tab };
      }

      logger.warn(`sheetsService: sheet "${tab}" did not contain expected headers ${JSON.stringify(requiredHeaderPartials)}; trying next tab`);
    } catch (err) {
      logger.warn(`sheetsService: could not fetch rows from tab "${tab}" — ${err.message}`);
      tried.push(tab);
    }
  }

  throw new Error(`Could not load sheet rows for spreadsheet ${spreadsheetId}. Tried tabs: ${JSON.stringify(tried)}.`);
}

// ─── Header resolver — finds column by partial name match ────────────────────

function findColIndex(headers, ...partialNames) {
  return headers.findIndex(h =>
    partialNames.some(p => String(h).toLowerCase().includes(p.toLowerCase()))
  );
}

function findHeaderRow(rows, ...requiredPartials) {
  for (let i = 0; i < Math.min(6, rows.length); i++) {
    const lower = (rows[i] || []).map(h => String(h || '').toLowerCase());
    if (requiredPartials.every(p => lower.some(h => h.includes(p)))) {
      return { rowIdx: i, headers: lower };
    }
  }
  return null;
}

// ─── Invoice dispatch sheet parser ───────────────────────────────────────────
// Expected columns (case-insensitive, partial match):
//   Invoice No  |  Vehicle No.  |  Customer  |  Chain Name  |  Location

async function fetchInvoiceMappings() {
  const sheetId = trimEnv('INVOICE_SHEET_ID');
  const tabName = trimEnv('INVOICE_SHEET_TAB', 'Sheet1');

  if (!sheetId) throw new Error('INVOICE_SHEET_ID is not set in .env');

  const { rows, tab } = await fetchSheetRowsWithTabFallback(sheetId, tabName, ['invoice', 'vehicle']);
  if (tab !== tabName) {
    logger.info(`sheetsService: invoice sheet tab fallback used — resolved to "${tab}"`);
  }
  if (rows.length < 2) {
    logger.warn('sheetsService: invoice sheet has fewer than 2 rows — nothing to parse');
    return [];
  }

  const found = findHeaderRow(rows, 'invoice', 'vehicle');
  if (!found) {
    throw new Error(
      'Invoice sheet: could not find a header row containing both "Invoice" and "Vehicle" columns. ' +
      `First row seen in tab "${tab}": ${JSON.stringify(rows[0])}`
    );
  }

  const { rowIdx, headers } = found;
  const idx = {
    invoice:  findColIndex(headers, 'invoice no', 'invoice'),
    vehicle:  findColIndex(headers, 'vehicle no', 'vehicle'),
    customer: findColIndex(headers, 'customer'),
    chain:    findColIndex(headers, 'chain'),
    location: findColIndex(headers, 'location'),
  };

  const mappings = [];
  const seen = new Set();

  for (let i = rowIdx + 1; i < rows.length; i++) {
    const row       = rows[i] || [];
    const invoiceNo = String(row[idx.invoice] || '').trim();
    const vehicleNo = String(row[idx.vehicle] || '').trim();

    if (!invoiceNo || !vehicleNo) continue;
    if (seen.has(invoiceNo)) continue;
    seen.add(invoiceNo);

    mappings.push({
      invoiceNo,
      vehicleNo,
      customerCode: idx.customer >= 0 ? String(row[idx.customer] || '').trim() : '',
      chainName:    idx.chain    >= 0 ? String(row[idx.chain]    || '').trim() : '',
      location:     idx.location >= 0 ? String(row[idx.location] || '').trim() : '',
    });
  }

  logger.info(`sheetsService: parsed ${mappings.length} invoice→vehicle entries`);
  return mappings;
}

// ─── Vehicle-device mapping sheet parser ─────────────────────────────────────
// Expected columns: Vehicle No.  |  device

async function fetchVehicleMappings() {
  const sheetId = trimEnv('VEHICLE_SHEET_ID');
  const tabName = trimEnv('VEHICLE_SHEET_TAB', 'Sheet1');

  if (!sheetId) throw new Error('VEHICLE_SHEET_ID is not set in .env');

  const { rows, tab } = await fetchSheetRowsWithTabFallback(sheetId, tabName, ['vehicle', 'device']);
  if (tab !== tabName) {
    logger.info(`sheetsService: vehicle sheet tab fallback used — resolved to "${tab}"`);
  }
  if (rows.length < 2) {
    logger.warn('sheetsService: vehicle sheet has fewer than 2 rows');
    return [];
  }

  const found = findHeaderRow(rows, 'vehicle', 'device');
  if (!found) {
    throw new Error(
      'Vehicle sheet: could not find a header row containing both "Vehicle" and "device" columns. ' +
      `First row seen in tab "${tab}": ${JSON.stringify(rows[0])}`
    );
  }

  const { rowIdx, headers } = found;
  const idxVeh = findColIndex(headers, 'vehicle');
  const idxDev = findColIndex(headers, 'device');

  const mappings = [];
  for (let i = rowIdx + 1; i < rows.length; i++) {
    const row        = rows[i] || [];
    const vehicleNo  = String(row[idxVeh] || '').trim();
    const deviceName = String(row[idxDev] || '').trim();
    if (vehicleNo && deviceName) mappings.push({ vehicleNo, deviceName });
  }

  logger.info(`sheetsService: parsed ${mappings.length} vehicle→device entries`);
  return mappings;
}

module.exports = {
  isConfigured,
  fetchInvoiceMappings,
  fetchVehicleMappings,
};
