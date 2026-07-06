/**
 * sheetsService.js
 *
 * Extended version — adds fetchRouteData() and fetchHierarchyData()
 * on top of the existing invoice/vehicle functions.
 *
 * New env vars required:
 *   ROUTE_SHEET_ID       — Spreadsheet ID for the Route Master sheet
 *   ROUTE_SHEET_TAB      — Tab name (default: Sheet1)
 *   HIERARCHY_SHEET_ID   — Spreadsheet ID for the Hierarchy sheet
 *   HIERARCHY_SHEET_TAB  — Tab name (default: Sheet1)
 */

const { google } = require('googleapis');
const path   = require('path');
const fs     = require('fs');
const logger = require('../utils/logger');

// ─── Safe env reader ──────────────────────────────────────────────────────────
function trimEnv(key, defaultVal = '') {
  const val = process.env[key];
  return val !== undefined ? String(val).trim() : defaultVal;
}

try {
  logger.info(
    `sheetsService (debug): INVOICE_SHEET_ID="${trimEnv('INVOICE_SHEET_ID')}", ` +
    `VEHICLE_SHEET_ID="${trimEnv('VEHICLE_SHEET_ID')}", ` +
    `ROUTE_SHEET_ID="${trimEnv('ROUTE_SHEET_ID')}", ` +
    `HIERARCHY_SHEET_ID="${trimEnv('HIERARCHY_SHEET_ID')}", ` +
    `GOOGLE_SERVICE_ACCOUNT_KEY="${trimEnv('GOOGLE_SERVICE_ACCOUNT_KEY')}"`
  );
} catch (e) { /* swallow */ }

// ─── Path helpers ──────────────────────────────────────────────────────────────
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
    // Upgraded from spreadsheets.readonly — the geofencing feature writes
    // "Reached" back to the Invoice Sheet's Status column. The service
    // account's Google account must also be shared as Editor (not just
    // Viewer) on the Invoice Sheet itself, or writes will fail at runtime
    // with a permissions error even though this scope is correct.
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  _authClient = await auth.getClient();
  logger.info('sheetsService: auth client initialised');
  return _authClient;
}

// ─── isConfigured ────────────────────────────────────────────────────────────
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

function isRouteConfigured() {
  const hasKey   = fs.existsSync(getKeyFilePath());
  const routeId  = trimEnv('ROUTE_SHEET_ID');
  return hasKey && !!routeId;
}

function isHierarchyConfigured() {
  const hasKey      = fs.existsSync(getKeyFilePath());
  const hierarchyId = trimEnv('HIERARCHY_SHEET_ID');
  return hasKey && !!hierarchyId;
}

function isDistributorLocationConfigured() {
  const hasKey = fs.existsSync(getKeyFilePath());
  const locId  = trimEnv('DISTRIBUTOR_LOCATION_SHEET_ID');
  return hasKey && !!locId;
}

// ─── Core row fetcher ─────────────────────────────────────────────────────────
function quoteSheetNameForRange(tabName) {
  const raw = String(tabName || '').trim();
  if (!raw) return raw;
  const [sheetName, range] = raw.split('!', 2);
  const quoted = sheetName.startsWith("'") && sheetName.endsWith("'")
    ? sheetName
    : `'${sheetName.replace(/'/g, "''")}'`;
  return range ? `${quoted}!${range}` : quoted;
}

async function fetchSheetRows(spreadsheetId, tabName) {
  const authClient = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth: authClient });
  const range  = quoteSheetNameForRange(tabName.trim());
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
  return response.data.sheets
    .map(s => String(s.properties.title || '').trim())
    .filter(Boolean);
}

async function fetchSheetRowsWithTabFallback(spreadsheetId, preferredTabName, requiredHeaderPartials = []) {
  const trimmedTab = String(preferredTabName || '').trim();
  const candidates = [];
  if (trimmedTab) candidates.push(trimmedTab);
  const actualTitles = await getSheetTitles(spreadsheetId);
  for (const title of actualTitles) {
    if (!candidates.includes(title)) candidates.push(title);
  }
  const tried = [];
  for (const tab of candidates) {
    if (!tab) continue;
    try {
      const rows = await fetchSheetRows(spreadsheetId, tab);
      tried.push(tab);
      if (rows.length === 0) {
        logger.warn(`sheetsService: sheet "${tab}" is empty; trying next tab`);
        continue;
      }
      if (requiredHeaderPartials.length === 0) return { rows, tab };
      const found = findHeaderRow(rows, ...requiredHeaderPartials);
      if (found) return { rows, tab };
      logger.warn(`sheetsService: sheet "${tab}" missing expected headers; trying next tab`);
    } catch (err) {
      logger.warn(`sheetsService: could not fetch rows from tab "${tab}" — ${err.message}`);
      tried.push(tab);
    }
  }
  throw new Error(
    `Could not load sheet rows for spreadsheet ${spreadsheetId}. Tried tabs: ${JSON.stringify(tried)}.`
  );
}

// ─── Header helpers ───────────────────────────────────────────────────────────
// IMPORTANT: partials are tried in PRIORITY order — the first partial is
// searched across every header first; only if NO header matches it do we
// fall through to the next partial. This prevents a generic fallback term
// (e.g. 'asm', 'name') from matching an unrelated column that merely
// contains that substring (e.g. 'ASM Area' contains 'asm'; 'ASM Name'
// contains 'name') before the function ever reaches the intended column.
// Normalizes a label for consistent grouping/display:
//   "south", "South", "SOUTH" all become "South"
// Short all-caps codes (≤3 chars, e.g. "GT", "SD", "MT") are left untouched
// since those are intentional abbreviations, not casing inconsistencies.
function normalizeLabel(str) {
  const trimmed = String(str || '').trim();
  if (!trimmed) return trimmed;
  if (trimmed.length <= 3 && trimmed === trimmed.toUpperCase()) return trimmed;
  return trimmed.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function findColIndex(headers, ...partialNames) {
  for (const p of partialNames) {
    const idx = headers.findIndex(h => String(h).toLowerCase().includes(p.toLowerCase()));
    if (idx !== -1) return idx;
  }
  return -1;
}

// 0-indexed column number → A1 letter(s), e.g. 0→"A", 25→"Z", 26→"AA".
function colIndexToLetter(idx) {
  let n = idx + 1;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
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

// ─── Invoice sheet write-back metadata ────────────────────────────────────────
// Set at the end of every fetchInvoiceMappings() call — remembers exactly
// where the Status column lives (spreadsheet, tab, column letter) so
// geofenceService can write "Reached" back to the right cells without
// re-resolving headers on every write.
let _invoiceSheetWriteMeta = null;
function getInvoiceSheetWriteMeta() { return _invoiceSheetWriteMeta; }

// ─── Invoice dispatch sheet parser ───────────────────────────────────────────
async function fetchInvoiceMappings() {
  const sheetId = trimEnv('INVOICE_SHEET_ID');
  const tabName = trimEnv('INVOICE_SHEET_TAB', 'Sheet1');
  if (!sheetId) throw new Error('INVOICE_SHEET_ID is not set in .env');

  const { rows, tab } = await fetchSheetRowsWithTabFallback(sheetId, tabName, ['invoice', 'vehicle']);
  if (tab !== tabName) logger.info(`sheetsService: invoice sheet tab fallback → "${tab}"`);
  if (rows.length < 2) return [];

  const found = findHeaderRow(rows, 'invoice', 'vehicle');
  if (!found) throw new Error('Invoice sheet: could not find header row with Invoice+Vehicle columns.');

  const { rowIdx, headers } = found;
  const idx = {
    invoice:         findColIndex(headers, 'invoice no', 'invoice'),
    vehicle:         findColIndex(headers, 'vehicle no', 'vehicle'),
    customer:        findColIndex(headers, 'customer'),
    chain:           findColIndex(headers, 'chain'),
    location:        findColIndex(headers, 'location'),
    // ── Added for Distributor Portal — purely additive, existing fields above unchanged ──
    distributorCode: findColIndex(headers, 'distributor code', 'dist code'),
    distributorName: findColIndex(headers, 'distributor name', 'dist name'),
    invoiceDate:     findColIndex(headers, 'invoice date', 'date'),
    status:          findColIndex(headers, 'status'),
    remarks:         findColIndex(headers, 'any other remarks', 'other remarks', 'remarks'),
    // ── Added for geofencing timestamp write-back — purely additive ──
    timestamp:       findColIndex(headers, 'timestamp'),
    // ── Added for ASM/TSOE Performance KPIs — purely additive, existing fields above unchanged ──
    appointmentDate: findColIndex(headers, 'appointment date', 'appointment'),
    // ── Added for Dispatch Date / Age column (Sheet Column S) — purely additive ──
    dispatchDate:    findColIndex(headers, 'dispatch date'),
    // ── Added for Departure/Arrival Time write-back — purely additive.
    // "departure" also matches "departure time" so the more specific
    // partial is tried first to avoid any future ambiguity. ──
    departureTime:   findColIndex(headers, 'departure time', 'departure'),
    arrivalTime:     findColIndex(headers, 'arrival time', 'arrival'),
  };

  // Remember exactly where Status (and Timestamp) live for write-back (geofencing).
  _invoiceSheetWriteMeta = {
    spreadsheetId:  sheetId,
    tab,
    statusColIndex: idx.status,
    statusColLetter: idx.status >= 0 ? colIndexToLetter(idx.status) : null,
    timestampColIndex: idx.timestamp,
    timestampColLetter: idx.timestamp >= 0 ? colIndexToLetter(idx.timestamp) : null,
    // ── Added for Departure/Arrival Time write-back ──
    departureColIndex:  idx.departureTime,
    departureColLetter: idx.departureTime >= 0 ? colIndexToLetter(idx.departureTime) : null,
    arrivalColIndex:     idx.arrivalTime,
    arrivalColLetter:    idx.arrivalTime >= 0 ? colIndexToLetter(idx.arrivalTime) : null,
  };
  if (idx.status < 0) {
    logger.warn('sheetsService: no Status column found — geofencing write-back will be disabled');
  }
  if (idx.timestamp < 0) {
    logger.warn('sheetsService: no Timestamp column found — geofencing write-back will only fill Status, not Timestamp');
  }
  if (idx.departureTime < 0) {
    logger.warn('sheetsService: no Departure Time column found — Inactive→Out for Delivery write-back will be disabled');
  }
  if (idx.arrivalTime < 0) {
    logger.warn('sheetsService: no Arrival Time column found — Arrival Time write-back will be disabled');
  }

  const mappings = [];
  const seen = new Set();
  for (let i = rowIdx + 1; i < rows.length; i++) {
    const row       = rows[i] || [];
    const invoiceNo = String(row[idx.invoice] || '').trim();
    const vehicleNo = String(row[idx.vehicle] || '').trim();
    if (!invoiceNo || !vehicleNo || seen.has(invoiceNo)) continue;
    seen.add(invoiceNo);
    mappings.push({
      invoiceNo,
      vehicleNo,
      customerCode:    idx.customer        >= 0 ? String(row[idx.customer]        || '').trim() : '',
      chainName:       idx.chain           >= 0 ? String(row[idx.chain]           || '').trim() : '',
      location:        idx.location        >= 0 ? String(row[idx.location]        || '').trim() : '',
      distributorCode: idx.distributorCode >= 0 ? String(row[idx.distributorCode] || '').trim() : '',
      distributorName: idx.distributorName >= 0 ? String(row[idx.distributorName] || '').trim() : '',
      invoiceDate:     idx.invoiceDate     >= 0 ? String(row[idx.invoiceDate]     || '').trim() : '',
      status:          idx.status          >= 0 ? String(row[idx.status]          || '').trim() : '',
      remarks:         idx.remarks         >= 0 ? String(row[idx.remarks]         || '').trim() : '',
      timestamp:       idx.timestamp       >= 0 ? String(row[idx.timestamp]       || '').trim() : '',
      appointmentDate: idx.appointmentDate >= 0 ? String(row[idx.appointmentDate] || '').trim() : '',
      // ── Added for Dispatch Date / Age column — actual vehicle dispatch date (Column S) ──
      dispatchDate:    idx.dispatchDate    >= 0 ? String(row[idx.dispatchDate]    || '').trim() : '',
      // ── Added for Departure/Arrival Time — read fresh on every sync so a
      // manual sheet edit is picked up, same as every other field here ──
      departureTime:   idx.departureTime   >= 0 ? String(row[idx.departureTime]   || '').trim() : '',
      arrivalTime:      idx.arrivalTime     >= 0 ? String(row[idx.arrivalTime]     || '').trim() : '',
      // ── Added for geofencing write-back — the exact sheet row (1-indexed) this came from ──
      sheetRowNumber:  i + 1,
    });
  }
  logger.info(`sheetsService: parsed ${mappings.length} invoice→vehicle entries`);

  // ── Diagnostic: confirm the Status column is actually what we think it is ──
  const blankCount = mappings.filter(m => String(m.status || '').trim() === '').length;
  const distinctStatuses = new Map();
  for (const m of mappings) {
    const s = String(m.status || '').trim() || '(blank)';
    distinctStatuses.set(s, (distinctStatuses.get(s) || 0) + 1);
  }
  logger.info(
    `sheetsService: Status column check — header matched at index ${idx.status} ` +
    `(-1 means no "status" header was found at all). ` +
    `${blankCount}/${mappings.length} rows have a blank status. ` +
    `Distinct values seen: ${JSON.stringify(Array.from(distinctStatuses.entries()))}`
  );
  return mappings;
}

// Formats "now" as IST clock time only, e.g. "11:30PM IST" — no date, no
// leading zero on the hour, AM/PM glued to the minutes per the requested
// format. Computed via manual UTC+5:30 offset arithmetic rather than
// Intl/timeZone options, since that depends on the Node build having full
// ICU data installed — this way it works identically everywhere.
function formatTimestampIST(date = new Date()) {
  const IST_OFFSET_MIN = 5 * 60 + 30;
  const istMs = date.getTime() + IST_OFFSET_MIN * 60 * 1000;
  const ist = new Date(istMs);

  let hours = ist.getUTCHours();
  const minutes = ist.getUTCMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;

  const mm = String(minutes).padStart(2, '0');
  return `${hours}:${mm}${ampm} IST`;
}

// ─── Write-back: Status + Timestamp columns (geofencing) ─────────────────────
// Batches every row that needs updating into a SINGLE Sheets API call,
// regardless of how many invoices crossed into "Reached" this cycle —
// important on a 13,000+ row sheet where per-row calls would burn through
// quota fast on a frequent refresh interval.
//
// When a Timestamp column exists, every row that gets the Status value also
// gets the current IST clock time written to Timestamp in the SAME batch
// call — not a second API round-trip. If no Timestamp column was found on
// the sheet, this silently skips the Timestamp write and only updates
// Status (already logged as a warning at parse time).
//
// rowNumbers: array of 1-indexed sheet row numbers (sheetRowNumber from
// fetchInvoiceMappings' output — NOT array indices).
async function updateInvoiceStatuses(rowNumbers, value = 'Reached') {
  if (!rowNumbers || rowNumbers.length === 0) return { success: true, updated: 0 };

  const meta = getInvoiceSheetWriteMeta();
  if (!meta || meta.statusColIndex < 0) {
    throw new Error('Cannot write Status updates — invoice sheet write metadata not available (run fetchInvoiceMappings at least once, and confirm a Status column was found).');
  }

  const authClient = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth: authClient });
  const quotedTab = quoteSheetNameForRange(meta.tab);

  // Written as plain text, e.g. "11:30PM IST" — Sheets will store it
  // literally as typed since this isn't a recognized date/time format,
  // so no cell-formatting surprises regardless of the column's format.
  const timestampValue = formatTimestampIST();

  const data = rowNumbers.map(rowNumber => ({
    range:  `${quotedTab}!${meta.statusColLetter}${rowNumber}`,
    values: [[value]],
  }));

  if (meta.timestampColIndex >= 0) {
    for (const rowNumber of rowNumbers) {
      data.push({
        range:  `${quotedTab}!${meta.timestampColLetter}${rowNumber}`,
        values: [[timestampValue]],
      });
    }
  }

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: meta.spreadsheetId,
    requestBody: { valueInputOption: 'RAW', data },
  });

  logger.info(
    `sheetsService: wrote "${value}" to Status for ${rowNumbers.length} row(s) in "${meta.tab}"` +
    (meta.timestampColIndex >= 0 ? ` (Timestamp also stamped: ${timestampValue})` : ' (no Timestamp column — skipped)')
  );
  return { success: true, updated: rowNumbers.length, timestamp: meta.timestampColIndex >= 0 ? timestampValue : null };
}

/**
 * Stamps the current IST clock time into the Departure Time column for the
 * given rows — used exactly once per invoice, at the moment its vehicle's
 * status flips Inactive → Out for Delivery (detected in geofenceService).
 * Callers are responsible for only ever passing rows whose Departure Time
 * cell is still blank — this function itself just writes what it's told,
 * same "trust the caller's filtering" design as updateInvoiceStatuses.
 */
async function updateInvoiceDepartureTimes(rowNumbers) {
  if (!rowNumbers || rowNumbers.length === 0) return { success: true, updated: 0 };

  const meta = getInvoiceSheetWriteMeta();
  if (!meta || meta.departureColIndex < 0) {
    logger.warn('sheetsService: no Departure Time column found — skipping departure-time write-back');
    return { success: false, reason: 'no_departure_column' };
  }

  const authClient = await getAuthClient();
  const sheetsApi   = google.sheets({ version: 'v4', auth: authClient });
  const quotedTab  = quoteSheetNameForRange(meta.tab);
  const timestampValue = formatTimestampIST();

  const data = rowNumbers.map(rowNumber => ({
    range:  `${quotedTab}!${meta.departureColLetter}${rowNumber}`,
    values: [[timestampValue]],
  }));

  await sheetsApi.spreadsheets.values.batchUpdate({
    spreadsheetId: meta.spreadsheetId,
    requestBody: { valueInputOption: 'RAW', data },
  });

  logger.info(`sheetsService: wrote Departure Time ("${timestampValue}") for ${rowNumbers.length} row(s) in "${meta.tab}"`);
  return { success: true, updated: rowNumbers.length, timestamp: timestampValue };
}

/**
 * Stamps the current IST clock time into the Arrival Time column for the
 * given rows — used exactly once per invoice, in the SAME pass as the
 * Status→"Reached" write in updateInvoiceStatuses (geofenceService calls
 * both together), since "reached" and "arrived" are the same event.
 * Same "caller filters to blank cells only" contract as the function above.
 */
async function updateInvoiceArrivalTimes(rowNumbers) {
  if (!rowNumbers || rowNumbers.length === 0) return { success: true, updated: 0 };

  const meta = getInvoiceSheetWriteMeta();
  if (!meta || meta.arrivalColIndex < 0) {
    logger.warn('sheetsService: no Arrival Time column found — skipping arrival-time write-back');
    return { success: false, reason: 'no_arrival_column' };
  }

  const authClient = await getAuthClient();
  const sheetsApi   = google.sheets({ version: 'v4', auth: authClient });
  const quotedTab  = quoteSheetNameForRange(meta.tab);
  const timestampValue = formatTimestampIST();

  const data = rowNumbers.map(rowNumber => ({
    range:  `${quotedTab}!${meta.arrivalColLetter}${rowNumber}`,
    values: [[timestampValue]],
  }));

  await sheetsApi.spreadsheets.values.batchUpdate({
    spreadsheetId: meta.spreadsheetId,
    requestBody: { valueInputOption: 'RAW', data },
  });

  logger.info(`sheetsService: wrote Arrival Time ("${timestampValue}") for ${rowNumbers.length} row(s) in "${meta.tab}"`);
  return { success: true, updated: rowNumbers.length, timestamp: timestampValue };
}

async function fetchVehicleMappings() {
  const sheetId = trimEnv('VEHICLE_SHEET_ID');
  const tabName = trimEnv('VEHICLE_SHEET_TAB', 'Sheet1');
  if (!sheetId) throw new Error('VEHICLE_SHEET_ID is not set in .env');

  const { rows, tab } = await fetchSheetRowsWithTabFallback(sheetId, tabName, ['vehicle', 'device']);
  if (tab !== tabName) logger.info(`sheetsService: vehicle sheet tab fallback → "${tab}"`);
  if (rows.length < 2) return [];

  const found = findHeaderRow(rows, 'vehicle', 'device');
  if (!found) throw new Error('Vehicle sheet: could not find header row with Vehicle+device columns.');

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

// ─── Route Master sheet parser ────────────────────────────────────────────────
// Expected columns (case-insensitive, partial match):
//   Route | ASM | Distributor Code | Distributor Name | DD City
async function fetchRouteData() {
  const sheetId = trimEnv('ROUTE_SHEET_ID');
  const tabName = trimEnv('ROUTE_SHEET_TAB', 'Sheet1');
  if (!sheetId) throw new Error('ROUTE_SHEET_ID is not set in .env');

  const { rows, tab } = await fetchSheetRowsWithTabFallback(sheetId, tabName, ['route', 'distributor']);
  if (tab !== tabName) logger.info(`sheetsService: route sheet tab fallback → "${tab}"`);
  if (rows.length < 2) return [];

  const found = findHeaderRow(rows, 'route', 'distributor');
  if (!found) throw new Error('Route sheet: could not find header row with Route+Distributor columns.');

  const { rowIdx, headers } = found;
  const idx = {
    route:     findColIndex(headers, 'route'),
    asm:       findColIndex(headers, 'asm'),
    distCode:  findColIndex(headers, 'distributor code', 'dist code', 'code'),
    distName:  findColIndex(headers, 'distributor name', 'dist name', 'name'),
    city:      findColIndex(headers, 'city', 'location', 'dd city'),
  };

  const routes = [];
  for (let i = rowIdx + 1; i < rows.length; i++) {
    const row      = rows[i] || [];
    const routeName = String(row[idx.route]    || '').trim();
    const distCode  = String(row[idx.distCode] || '').trim();
    if (!routeName || !distCode) continue;

    routes.push({
      routeName,
      asmName:           idx.asm      >= 0 ? String(row[idx.asm]      || '').trim() : '',
      distributorCode:   distCode,
      distributorName:   idx.distName >= 0 ? String(row[idx.distName] || '').trim() : '',
      city:              idx.city     >= 0 ? String(row[idx.city]     || '').trim() : '',
    });
  }
  logger.info(`sheetsService: parsed ${routes.length} route entries`);
  return routes;
}

// ─── Hierarchy sheet parser ───────────────────────────────────────────────────
// Expected columns per cluster tab:
//   Region | DD Type | ASM Area | ASM Name | TSOE Name |
//   Distributor Code | Distributor Name | Town/City | Status |
//   Dist Mobile Number | TSOE Mobile Number
//
// IMPORTANT: "Cluster" is NOT a column — it is represented by separate tabs
// inside the spreadsheet (e.g. "Cluster 1", "Cluster 2", "Cluster 3"...).
// This function auto-discovers every tab whose name starts with
// HIERARCHY_CLUSTER_PREFIX (default "Cluster") and reads each one
// independently, tagging every row with which tab (cluster) it came from.
// Adding a new "Cluster 3" tab later requires ZERO code or .env changes.
async function fetchHierarchyData() {
  const sheetId = trimEnv('HIERARCHY_SHEET_ID');
  if (!sheetId) throw new Error('HIERARCHY_SHEET_ID is not set in .env');

  const clusterPrefix = trimEnv('HIERARCHY_CLUSTER_PREFIX', 'Cluster');
  const allTitles = await getSheetTitles(sheetId);
  let clusterTabs = allTitles.filter(t =>
    t.toLowerCase().startsWith(clusterPrefix.toLowerCase())
  );

  // Backward-compat: if no tab matches the prefix, fall back to the single
  // legacy tab name so older single-cluster setups keep working unmodified.
  if (clusterTabs.length === 0) {
    const legacyTab = trimEnv('HIERARCHY_SHEET_TAB', 'Sheet1');
    clusterTabs = [legacyTab];
    logger.warn(
      `sheetsService: no tabs match prefix "${clusterPrefix}" — ` +
      `falling back to single tab "${legacyTab}"`
    );
  } else {
    logger.info(`sheetsService: discovered ${clusterTabs.length} cluster tab(s): ${clusterTabs.join(', ')}`);
  }

  const allEntries = [];

  for (const tabName of clusterTabs) {
    let rows;
    try {
      rows = await fetchSheetRows(sheetId, tabName);
    } catch (err) {
      logger.warn(`sheetsService: could not read cluster tab "${tabName}" — ${err.message}`);
      continue;
    }

    if (rows.length < 2) {
      logger.warn(`sheetsService: cluster tab "${tabName}" is empty — skipping`);
      continue;
    }

    const found = findHeaderRow(rows, 'distributor', 'asm');
    if (!found) {
      logger.warn(`sheetsService: cluster tab "${tabName}" missing Distributor+ASM headers — skipping`);
      continue;
    }

    const { rowIdx, headers } = found;
    const idx = {
      region:     findColIndex(headers, 'region', 'zone'),
      ddType:     findColIndex(headers, 'dd type', 'ddtype'),
      asmArea:    findColIndex(headers, 'asm area'),
      asmName:    findColIndex(headers, 'asm name', 'asm'),
      tsoeName:   findColIndex(headers, 'hq name', 'hq'),
      distCode:   findColIndex(headers, 'distributor code', 'dist code'),
      distName:   findColIndex(headers, 'distributor name', 'dist name'),
      townCity:   findColIndex(headers, 'town', 'city'),
      status:     findColIndex(headers, 'status'),
      distMobile: findColIndex(headers, 'dist mobile', 'distributor mobile'),
      tsoeMobile: findColIndex(headers, 'tsoe mobile'),
    };

    let countForTab = 0;
    const regionCounts = new Map(); // diagnostic: every distinct raw region value seen in this tab
    for (let i = rowIdx + 1; i < rows.length; i++) {
      const row      = rows[i] || [];
      const distCode = String(row[idx.distCode] || '').trim();
      if (!distCode) continue;

      const rawRegion = idx.region >= 0 ? String(row[idx.region] || '').trim() : '';
      regionCounts.set(rawRegion || '(blank)', (regionCounts.get(rawRegion || '(blank)') || 0) + 1);

      allEntries.push({
        clusterName:     tabName,
        region:          normalizeLabel(rawRegion),
        ddType:          idx.ddType     >= 0 ? String(row[idx.ddType]     || '').trim() : '',
        asmArea:         idx.asmArea    >= 0 ? String(row[idx.asmArea]    || '').trim() : '',
        asmName:         idx.asmName    >= 0 ? String(row[idx.asmName]    || '').trim() : '',
        tsoeName:        idx.tsoeName   >= 0 ? String(row[idx.tsoeName]   || '').trim() : '',
        distributorCode: distCode,
        distributorName: idx.distName   >= 0 ? String(row[idx.distName]   || '').trim() : '',
        townCity:        idx.townCity   >= 0 ? String(row[idx.townCity]   || '').trim() : '',
        status:          idx.status     >= 0 ? String(row[idx.status]     || '').trim() : '',
        distMobile:      idx.distMobile >= 0 ? String(row[idx.distMobile] || '').trim() : '',
        tsoeMobile:      idx.tsoeMobile >= 0 ? String(row[idx.tsoeMobile] || '').trim() : '',
      });
      countForTab++;
    }
    logger.info(`sheetsService: parsed ${countForTab} entries from cluster tab "${tabName}"`);
    if (regionCounts.size > 1) {
      logger.warn(
        `sheetsService: cluster tab "${tabName}" has ${regionCounts.size} DIFFERENT region values — ` +
        `expected only 1. Values found: ${JSON.stringify(Array.from(regionCounts.entries()))}`
      );
    }
  }

  logger.info(
    `sheetsService: parsed ${allEntries.length} total hierarchy entries across ${clusterTabs.length} cluster tab(s)`
  );
  return allEntries;
}

// ─── Distributor Lat/Long sheet parser (geofencing) ───────────────────────────
// Expected columns (case-insensitive, partial match):
//   DISTRIBUTOR_CODE | LATITUDE | LONGITUDE | DISTRIBUTOR_NAME |
//   CITY_NAME | STATE_NAME | PINCODE | ADDRESS
async function fetchDistributorLocations() {
  const sheetId = trimEnv('DISTRIBUTOR_LOCATION_SHEET_ID');
  const tabName = trimEnv('DISTRIBUTOR_LOCATION_SHEET_TAB', 'Sheet1');
  if (!sheetId) throw new Error('DISTRIBUTOR_LOCATION_SHEET_ID is not set in .env');

  const { rows, tab } = await fetchSheetRowsWithTabFallback(sheetId, tabName, ['distributor', 'lat']);
  if (tab !== tabName) logger.info(`sheetsService: distributor-location sheet tab fallback → "${tab}"`);
  if (rows.length < 2) return [];

  const found = findHeaderRow(rows, 'distributor', 'lat');
  if (!found) throw new Error('Distributor Location sheet: could not find header row with Distributor Code+Latitude columns.');

  const { rowIdx, headers } = found;
  const idx = {
    distCode: findColIndex(headers, 'distributor code', 'distributor_code', 'dist code'),
    lat:      findColIndex(headers, 'latitude'),
    lng:      findColIndex(headers, 'longitude'),
    distName: findColIndex(headers, 'distributor name', 'distributor_name', 'dist name'),
    city:     findColIndex(headers, 'city name', 'city_name', 'city'),
    state:    findColIndex(headers, 'state name', 'state_name', 'state'),
    pincode:  findColIndex(headers, 'pincode', 'pin code'),
    address:  findColIndex(headers, 'address'),
  };

  const locations = [];
  for (let i = rowIdx + 1; i < rows.length; i++) {
    const row      = rows[i] || [];
    const distCode = String(row[idx.distCode] || '').trim();
    const lat      = idx.lat >= 0 ? parseFloat(row[idx.lat]) : NaN;
    const lng      = idx.lng >= 0 ? parseFloat(row[idx.lng]) : NaN;
    if (!distCode || isNaN(lat) || isNaN(lng)) continue;

    locations.push({
      distributorCode: distCode,
      latitude:        lat,
      longitude:       lng,
      distributorName: idx.distName >= 0 ? String(row[idx.distName] || '').trim() : '',
      cityName:        idx.city    >= 0 ? String(row[idx.city]      || '').trim() : '',
      stateName:       idx.state   >= 0 ? String(row[idx.state]     || '').trim() : '',
      pincode:         idx.pincode >= 0 ? String(row[idx.pincode]   || '').trim() : '',
      address:         idx.address >= 0 ? String(row[idx.address]   || '').trim() : '',
    });
  }
  logger.info(`sheetsService: parsed ${locations.length} distributor location entries`);
  return locations;
}

module.exports = {
  isConfigured,
  isRouteConfigured,
  isHierarchyConfigured,
  isDistributorLocationConfigured,
  fetchInvoiceMappings,
  fetchVehicleMappings,
  fetchRouteData,
  fetchHierarchyData,
  fetchDistributorLocations,
  updateInvoiceStatuses,
  updateInvoiceDepartureTimes,
  updateInvoiceArrivalTimes,
  getInvoiceSheetWriteMeta,
};
