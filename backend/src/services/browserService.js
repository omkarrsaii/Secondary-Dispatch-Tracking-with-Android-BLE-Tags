/**
 * browserService.js
 *
 * ROOT CAUSE FIXES (Issues 3 & 4):
 *
 * ISSUE 4 — Browser opens/closes every fetch cycle:
 *   Old code: fetchAllDevices() called launchBrowser() → context.close() on every run.
 *   Fix: Browser is a module-level singleton. initBrowserSingleton() launches it
 *   ONCE at server startup. fetchAllDevices() reuses the same context & page.
 *   context.close() is never called during normal operation.
 *
 * ISSUE 4b — Headless hardcoded false on Windows:
 *   Old code: const headless = process.platform === 'win32' ? false : HEADLESS;
 *   This ignored HEADLESS=true in .env on Windows, keeping Chrome always visible.
 *   Fix: headless = HEADLESS (env var respected on all platforms).
 *   The anti-detection flags (--disable-blink-features=AutomationControlled) are
 *   sufficient to prevent Google detecting automation in headless mode.
 *
 * ISSUE 3 — Session not persisting / "Sign in" on moto tag:
 *   a) Closing the browser context between cycles prevented cookie persistence.
 *      Fix: singleton keeps the context alive; cookies stay in memory and are
 *      flushed to the Chrome profile dir on graceful shutdown only.
 *
 *   b) For Bluetooth tracker tags (Moto Tag, Tile, etc.) Google Find Hub shows
 *      a "Recent location available — Sign in" prompt inside the device detail
 *      panel. The old code never clicked this button, so [data-location-lat]
 *      never appeared and the device returned no coordinates.
 *      Fix: clickDeviceByName() now detects and clicks the Sign-in / load-
 *      location button before polling for coordinates.
 */

const { chromium } = require('playwright');
const { spawn }    = require('child_process');
const path  = require('path');
const fs    = require('fs');
const logger = require('../utils/logger');

// ─── Config ───────────────────────────────────────────────────────────────────

const HEADLESS     = process.env.HEADLESS !== 'false';   // true unless explicitly "false"
const FIND_HUB_URL = 'https://www.google.com/android/find/';
const PROFILE_DIR  = path.resolve(
  process.env.CHROME_PROFILE_DIR || path.join(__dirname, '../../data/chrome-profile')
);
const DEBUG_DIR    = path.join(__dirname, '../../data/debug');
const READY_FILE   = path.join(PROFILE_DIR, '.login-complete');
const FIND_HUB_PIN = (process.env.FIND_HUB_TAG_PIN || process.env.FIND_HUB_PIN || '').trim();

// ─── Browser singleton ────────────────────────────────────────────────────────

let _context = null;   // BrowserContext — kept alive for the process lifetime
let _page    = null;   // Single reused page

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }
function hasSession()  { return fs.existsSync(READY_FILE); }

function findChrome() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'Google\\Chrome\\Application\\chrome.exe')
      : null,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
  ].filter(Boolean);

  for (const p of candidates) {
    try { if (fs.existsSync(p)) { logger.info('Chrome: ' + p); return p; } } catch {}
  }
  return null;
}

async function saveDebugSnapshot(page, label) {
  try {
    ensureDir(DEBUG_DIR);
    const ts  = Date.now();
    const png = path.join(DEBUG_DIR, `${label}-${ts}.png`);
    await page.screenshot({ path: png, fullPage: true });
    const info = {
      url:   page.url(),
      title: await page.title().catch(() => ''),
      body:  await page.evaluate(() => document.body?.innerText?.slice(0, 3000)).catch(() => ''),
      dataIndexCount:       await page.evaluate(() => document.querySelectorAll('[data-index]').length).catch(() => -1),
      dataLocationLatCount: await page.evaluate(() => document.querySelectorAll('[data-location-lat]').length).catch(() => -1),
    };
    fs.writeFileSync(path.join(DEBUG_DIR, `${label}-${ts}.txt`), JSON.stringify(info, null, 2));
    logger.info(`Snapshot → ${png}`);
    logger.info(`  URL: ${info.url} | [data-index]: ${info.dataIndexCount}`);
    logger.info(`  Body: ${info.body.slice(0, 200).replace(/\n+/g, ' ')}`);
  } catch (e) { logger.warn('Snapshot failed: ' + e.message); }
}

// ─── Core browser launch (internal — called by initBrowserSingleton only) ────

async function _launchContext() {
  ensureDir(PROFILE_DIR);
  const chromeExe = findChrome();
  if (!chromeExe) throw new Error('Google Chrome not found on this machine.');

  const useSandbox = process.env.CHROME_SANDBOX !== 'false';

  // FIX: respect HEADLESS env var on ALL platforms (was forced false on Windows)
  const headless = HEADLESS;
  logger.info(`Launching Chrome (headless=${headless}, sandbox=${useSandbox}, profile=${PROFILE_DIR})`);

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless,
    executablePath:   chromeExe,
    chromiumSandbox:  useSandbox,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--no-first-run',
      '--no-default-browser-check',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
    viewport:   { width: 1280, height: 900 },
    userAgent:  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale:     'en-US',
    timezoneId: 'Asia/Kolkata',
  });

  // Anti-detection init script
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver',  { get: () => undefined });
    Object.defineProperty(navigator, 'plugins',    { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages',  { get: () => ['en-US', 'en'] });
    window.chrome = { runtime: {} };
  });

  return context;
}

// ─── initBrowserSingleton — called ONCE at server startup ────────────────────

async function initBrowserSingleton() {
  if (_context && !_context.isClosed()) {
    logger.info('Browser singleton already running');
    return;
  }

  _context = await _launchContext();

  // Handle unexpected crash / close
  _context.on('close', () => {
    logger.warn('Browser context closed unexpectedly — will reinitialise on next fetch');
    _context = null;
    _page    = null;
  });

  // Reuse or create the main page
  const pages = _context.pages();
  _page = pages.length > 0 ? pages[0] : await _context.newPage();

  logger.info('Browser singleton ready');
}

// ─── getActivePage — returns the live singleton page (reinits if crashed) ────

async function getActivePage() {
  if (!_context || _context.isClosed()) {
    logger.info('Browser not running — reinitialising singleton');
    await initBrowserSingleton();
  }
  if (!_page || _page.isClosed()) {
    _page = await _context.newPage();
  }
  return _page;
}

// ─── setupLogin (interactive — run once via npm run setup-login) ──────────────

async function setupLogin() {
  ensureDir(PROFILE_DIR);
  const chromeExe = findChrome();
  if (!chromeExe) throw new Error('Google Chrome not found.');

  logger.info('Profile: ' + PROFILE_DIR);
  logger.info('');
  logger.info('════════════════════════════════════════════════════════════');
  logger.info(' Log in with the account that has ALL your Find Hub devices.');
  logger.info(' Wait until device names appear in the LEFT sidebar, then');
  logger.info(' press ENTER here.');
  logger.info('════════════════════════════════════════════════════════════');

  const chrome = spawn(chromeExe, [`--user-data-dir=${PROFILE_DIR}`, FIND_HUB_URL], {
    detached: false, stdio: 'ignore',
  });
  logger.info('Chrome PID: ' + chrome.pid + ' — press ENTER when ready...');

  await new Promise(resolve => {
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', resolve);
  });

  ensureDir(PROFILE_DIR);
  fs.writeFileSync(READY_FILE, new Date().toISOString());
  try { chrome.kill(); await new Promise(r => setTimeout(r, 2000)); } catch {}
  logger.info('✓ Session saved to profile. Server will use this login automatically.');
  return { count: '?', names: ['verified on first fetch'] };
}

// ─── waitForFindHub ───────────────────────────────────────────────────────────

async function waitForFindHub(page) {
  let url = page.url();
  logger.info('Initial URL: ' + url);

  if (url.includes('/about') || url.includes('accounts.google.com')) {
    logger.info('Waiting for SPA redirect (up to 20s)...');
    try {
      await page.waitForURL(
        u => !u.includes('/about') && !u.includes('accounts.google.com'),
        { timeout: 20000 }
      );
      url = page.url();
      logger.info('After redirect: ' + url);
    } catch {
      logger.info('No redirect within 20s. URL: ' + page.url());
    }
  }

  if (page.url().includes('accounts.google.com')) {
    await saveDebugSnapshot(page, 'auth-required');
    return { state: 'expired' };
  }

  logger.info('Polling for device content...');
  for (let i = 0; i < 45; i++) {
    await page.waitForTimeout(1000);

    const result = await page.evaluate(() => {
      const sidebarEls  = document.querySelectorAll('[data-index]');
      const locationEl  = document.querySelector('[data-location-lat]');
      const bodyText    = document.body?.innerText?.slice(0, 300) || '';
      return {
        sidebarCount: sidebarEls.length,
        hasLocation:  !!locationEl,
        bodyPreview:  bodyText.replace(/\n+/g, ' '),
        currentUrl:   window.location.href,
      };
    });

    if (i % 5 === 0) {
      logger.info(`[${i}s] sidebar=${result.sidebarCount} location=${result.hasLocation} url=${result.currentUrl}`);
    }

    if (result.sidebarCount > 0) {
      logger.info(`Sidebar appeared after ${i + 1}s with ${result.sidebarCount} devices`);
      return { state: 'sidebar', count: result.sidebarCount };
    }
    if (result.hasLocation) {
      logger.info(`Single device auto-selected after ${i + 1}s`);
      return { state: 'autoselected' };
    }
  }

  await saveDebugSnapshot(page, 'wait-timeout');
  return { state: 'empty' };
}

// ─── extractDeviceNames ───────────────────────────────────────────────────────

async function extractDeviceNames(page) {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll('[data-index]')).map(el => {
      for (const sel of ['.KaKp4c', '.Hj7hL', '.oRIfSc', '[data-device-name]']) {
        const t = el.querySelector(sel)?.innerText?.trim();
        if (t) return t;
      }
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const t = node.textContent.trim();
        if (t.length > 2 && t.length < 60) return t;
      }
      return '';
    }).filter(n => n.length > 0);
  });
}

// ─── handleTrackerSignIn ──────────────────────────────────────────────────────
// Tracker tags (Moto Tag, Noise Tag, etc.) show a "Recent location available
// — Sign in" panel instead of showing coordinates directly.
//
// ROOT CAUSE of previous failure:
//   page.evaluate + querySelectorAll('a, button, [role="button"], [tabindex="0"]')
//   does NOT find this element because Google Find Hub uses custom Material Web
//   Components (<md-text-button>, <md-filled-button>, etc.) that have no standard
//   ARIA role or tabindex attributes recognisable via querySelectorAll.
//
// FIX: Use Playwright's own locator engine (getByText / locator) which resolves
//   text against the *rendered accessible tree*, not raw DOM attributes.
//   Three strategies are tried in order; the first one that finds a visible
//   element wins.

async function handleTrackerSignIn(page, deviceName) {
  // ── Strategy 1: Playwright getByText (resolves rendered text, not DOM attrs) ──
  try {
    const signInEl = page.getByText('Sign in', { exact: true }).first();
    const visible  = await signInEl.isVisible({ timeout: 3000 }).catch(() => false);
    if (visible) {
      logger.info(`  [tracker] Clicking "Sign in" via getByText for "${deviceName}"...`);
      await signInEl.click();
      await page.waitForTimeout(6000);
      // If clicking "Sign in" triggered a Google account navigation, handle it
      if (page.url().includes('accounts.google.com')) {
        logger.info('  [tracker] Google account page detected — handling confirmation...');
        await _handleGoogleAccountPage(page);
        await page.waitForTimeout(5000);
      }
      return true;
    }
  } catch (e) {
    logger.info(`  [tracker] getByText strategy: ${e.message}`);
  }

  // ── Strategy 2: Click the whole "Recent location available" panel ─────────────
  try {
    const panel   = page.locator(':text("Recent location")').first();
    const visible = await panel.isVisible({ timeout: 1500 }).catch(() => false);
    if (visible) {
      logger.info(`  [tracker] Clicking "Recent location" panel for "${deviceName}"...`);
      await panel.click();
      await page.waitForTimeout(6000);
      return true;
    }
  } catch {}

  // ── Strategy 3: Text-node walk — catches any element with visible "Sign in" ───
  const handled = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const text = (node.textContent || '').trim();
      if (text !== 'Sign in' && text !== 'SIGN IN') continue;

      let el = node.parentElement;
      // Walk up to find the first visible, clickable ancestor
      for (let depth = 0; depth < 4 && el; depth++, el = el.parentElement) {
        if (el.offsetParent !== null) {   // visible
          el.click();
          return `clicked via text-walk: <${el.tagName.toLowerCase()}>`;
        }
      }
    }

    // Fallback: click any element whose innerText is exactly "Sign in"
    const all = Array.from(document.querySelectorAll('*'));
    const btn = all.find(el =>
      el.offsetParent !== null &&
      el.children.length === 0 &&
      (el.innerText || '').trim() === 'Sign in'
    );
    if (btn) { btn.click(); return `clicked leaf element: <${btn.tagName.toLowerCase()}>`; }

    return null;
  });

  if (handled) {
    logger.info(`  [tracker] Sign-in handled (${handled}) for "${deviceName}"`);
    await page.waitForTimeout(6000);
    return true;
  }

  logger.info(`  [tracker] No "Sign in" element found — device may be a phone (no gate needed)`);
  return false;
}

async function handleTrackerPin(page, deviceName) {
  if (!FIND_HUB_PIN) return false;

  const result = await page.evaluate((pin) => {
    const normalize = text => (text || '').toString().trim().toLowerCase();
    const inputs = Array.from(document.querySelectorAll('input'));
    const pinInput = inputs.find(input => {
      const attrs = [input.placeholder, input.getAttribute('aria-label'), input.name, input.id, input.title]
        .filter(Boolean).map(normalize).join(' ');
      if (/pin|passcode|security code|verification code|code/i.test(attrs)) return true;
      if (input.type === 'password' || input.type === 'tel' || input.type === 'number') return true;
      return false;
    });

    if (!pinInput) return { filled: false, reason: 'no_pin_input' };

    pinInput.focus();
    pinInput.value = pin;
    pinInput.dispatchEvent(new Event('input', { bubbles: true }));
    pinInput.dispatchEvent(new Event('change', { bubbles: true }));

    const buttons = Array.from(document.querySelectorAll('button, input[type="submit"]'));
    const submit = buttons.find(btn => /continue|submit|ok|verify|enter|done/i.test(normalize(btn.innerText || btn.value || '')));
    if (submit) {
      submit.click();
      return { filled: true, clicked: normalize(submit.innerText || submit.value || '') };
    }

    const form = pinInput.form || pinInput.closest('form');
    if (form) {
      form.submit();
      return { filled: true, clicked: 'form.submit' };
    }

    return { filled: true, clicked: 'none' };
  }, FIND_HUB_PIN);

  if (result.filled) {
    logger.info(`  [tracker] Entered PIN for "${deviceName}" (${result.clicked})`);
    await page.waitForTimeout(4000);
    return true;
  }

  logger.info(`  [tracker] PIN prompt not found for "${deviceName}" (${result.reason})`);
  return false;
}

// ─── _handleGoogleAccountPage (internal) ─────────────────────────────────────
// If clicking "Sign in" inside Find Hub navigates to accounts.google.com
// (account picker / "Choose an account"), we click the first listed account.
// Since setup-login already saved the session, this should auto-confirm
// without requiring a password.

async function _handleGoogleAccountPage(page) {
  try {
    // Account list items
    const account = page.locator('[data-authuser], [data-identifier]').first();
    if (await account.isVisible({ timeout: 3000 })) {
      await account.click();
      await page.waitForURL(u => u.includes('google.com/android/find'), { timeout: 10000 });
      return;
    }
    // "Continue" / "Use another account" — just hit Continue
    const continueBtn = page.getByRole('button', { name: /continue/i }).first();
    if (await continueBtn.isVisible({ timeout: 2000 })) {
      await continueBtn.click();
      await page.waitForURL(u => u.includes('google.com/android/find'), { timeout: 10000 });
    }
  } catch (e) {
    logger.warn('  [tracker] Account page handler error: ' + e.message);
  }
}

// ─── clickDeviceByName ────────────────────────────────────────────────────────

async function clickDeviceByName(page, deviceName) {
  // Step 1: click the sidebar card
  const clickResult = await page.evaluate((name) => {
    const devices = Array.from(document.querySelectorAll('[data-index]'));
    const card    = devices.find(el =>
      (el.innerText || '').toLowerCase().includes(name.toLowerCase())
    );
    if (!card) {
      return { ok: false, available: devices.map(el => el.innerText?.trim()?.slice(0, 50)) };
    }
    const btn = card.querySelector('[role="button"]') ||
                card.querySelector('[tabindex="0"]')  || card;
    btn.click();
    return { ok: true };
  }, deviceName);

  if (!clickResult.ok) {
    logger.warn(`"${deviceName}" not in DOM. Available: ${JSON.stringify(clickResult.available)}`);
    return false;
  }
  logger.info(`Clicked card for "${deviceName}"`);

  // Step 2: wait for detail panel to render
  await page.waitForTimeout(3000);

  // Step 3: handle tracker "Sign in" gate (Noise Tag, Moto Tag, etc.)
  await handleTrackerSignIn(page, deviceName);
  await handleTrackerPin(page, deviceName);

  // Step 4: poll up to 20s — trackers are slower than phones
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(500);
    const coords = await page.evaluate(() => {
      const el = document.querySelector('[data-location-lat]');
      return el ? { lat: el.dataset.locationLat, lng: el.dataset.locationLng } : null;
    });
    if (coords?.lat) {
      logger.info(`  Coords after ${((i + 1) * 0.5).toFixed(1)}s: ${coords.lat}, ${coords.lng}`);
      return true;
    }
  }

  logger.warn(`  No coords after 20s for "${deviceName}"`);
  await saveDebugSnapshot(page, `no-coords-${deviceName.replace(/\s+/g, '-')}`);
  return true;
}

// ─── extractActiveDeviceData ──────────────────────────────────────────────────

async function extractActiveDeviceData(page) {
  return page.evaluate(() => {
    let lat = null, lng = null;

    const locEl = document.querySelector('[data-location-lat]');
    if (locEl?.dataset?.locationLat) {
      lat = locEl.dataset.locationLat;
      lng = locEl.dataset.locationLng;
    }

    if (!lat) {
      const active = document.querySelector('[data-active="true"]');
      if (active?.dataset?.locationLat) {
        lat = active.dataset.locationLat;
        lng = active.dataset.locationLng;
      }
    }

    if (!lat) {
      const marker = document.querySelector('gmp-advanced-marker');
      if (marker) {
        const pos = marker.getAttribute('gmp-clickable-position');
        if (pos?.includes(',')) [lat, lng] = pos.split(',').map(s => s.trim());
        if (!lat && marker.position) {
          try { lat = String(marker.position.lat()); lng = String(marker.position.lng()); } catch {}
          if (!lat) {
            const numKeys = Object.keys(marker.position)
              .filter(k => typeof marker.position[k] === 'number' && Math.abs(marker.position[k]) <= 180);
            if (numKeys.length >= 2) {
              lat = String(marker.position[numKeys[0]]);
              lng = String(marker.position[numKeys[1]]);
            }
          }
        }
      }
    }

    let deviceName = null;
    for (const sel of ['.KaKp4c', '.Hj7hL', '[data-device-name]', 'h1', 'h2']) {
      const t = document.querySelector(sel)?.innerText?.trim();
      if (t && t.length > 1 && t.length < 60) { deviceName = t; break; }
    }

    let battery = null;
    for (const el of document.querySelectorAll('*')) {
      if (el.children.length > 0) continue;
      const t = el.innerText?.trim();
      if (!t) continue;
      if (el.dataset?.battery) { battery = el.dataset.battery; break; }
      const m = t.match(/^(\d{1,3})%$/);
      if (m && parseInt(m[1]) <= 100) { battery = m[1]; break; }
    }

    let network = null;
    const panel = document.querySelector('[data-active="true"]') || document.body;
    const netEl = panel.querySelector('[data-network],[data-wifi],[data-ssid]');
    if (netEl) network = netEl.dataset.network || netEl.dataset.wifi || netEl.dataset.ssid;

    let lastSeen = null;
    for (const el of document.querySelectorAll('*')) {
      if (el.children.length > 0) continue;
      const t = el.innerText?.trim();
      if (t && /last seen|minute|hour|day|just now|second/i.test(t) && t.length < 80) {
        lastSeen = t; break;
      }
    }

    let imageUrl = null;
    for (const img of document.querySelectorAll('img')) {
      const src = img.src || '';
      if (!src || /maps|logo|icon|avatar|gstatic\.com\/images\/icons/i.test(src)) continue;
      if ((img.naturalWidth || img.width) > 40) { imageUrl = src; break; }
    }

    return { lat, lng, deviceName, battery, network, lastSeen, imageUrl };
  });
}

// ─── fetchAllDevices — main entry point called by fetchService ────────────────
// FIX: Uses the singleton browser. Never closes the context.
// On session expiry, resets the singleton so it is rebuilt on next fetch.

async function fetchAllDevices() {
  if (!hasSession()) throw new Error('SESSION_EXPIRED');

  logger.info('=== Fetch started ===');

  const page = await getActivePage();

  try {
    await page.goto(FIND_HUB_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(4000);

    const initial = await waitForFindHub(page);
    logger.info('Page state: ' + initial.state);

    if (initial.state === 'expired' || initial.state === 'empty') {
      // Reset singleton so next fetch relaunches fresh
      if (_context && !_context.isClosed()) {
        await _context.close().catch(() => {});
      }
      _context = null;
      _page    = null;
      throw new Error('SESSION_EXPIRED');
    }

    // Single device auto-selected
    if (initial.state === 'autoselected') {
      logger.info('Single device auto-selected — extracting directly');
      const data = await extractActiveDeviceData(page);
      if (!data.lat) return [];
      return [{
        device_name:    data.deviceName || 'Device 1',
        latitude:       data.lat,
        longitude:      data.lng,
        battery:        data.battery,
        network:        data.network,
        last_seen_text: data.lastSeen,
        image_url:      data.imageUrl,
      }];
    }

    // Normal sidebar flow — iterate each device
    const deviceNames = await extractDeviceNames(page);
    logger.info(`Device names: ${deviceNames.map(n => `"${n}"`).join(', ')}`);

    if (deviceNames.length === 0) {
      await saveDebugSnapshot(page, 'no-names');
      if (_context && !_context.isClosed()) await _context.close().catch(() => {});
      _context = null;
      _page    = null;
      throw new Error('SESSION_EXPIRED');
    }

    const results = [];
    for (const deviceName of deviceNames) {
      logger.info(`\n--- Processing: "${deviceName}" ---`);

      await page.goto(FIND_HUB_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(4000);

      const state = await waitForFindHub(page);
      if (state.state !== 'sidebar') {
        logger.warn(`State "${state.state}" — skipping "${deviceName}"`);
        continue;
      }

      await clickDeviceByName(page, deviceName);
      const data = await extractActiveDeviceData(page);
      logger.info(`  lat=${data.lat} lng=${data.lng} battery=${data.battery}% lastSeen=${data.lastSeen}`);

      results.push({
        device_name:    data.deviceName || deviceName,
        latitude:       data.lat,
        longitude:      data.lng,
        battery:        data.battery,
        network:        data.network,
        last_seen_text: data.lastSeen,
        image_url:      data.imageUrl,
      });
    }

    logger.info(`\n=== Fetch complete — ${results.length}/${deviceNames.length} devices ===`);
    return results;

  } catch (err) {
    // Don't close the browser on general errors — only on SESSION_EXPIRED (handled above)
    throw err;
  }
  // NOTE: NO context.close() here — singleton stays alive
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────
// Call this when the Node process exits so the Chrome profile is flushed to disk.

async function closeBrowser() {
  if (_context && !_context.isClosed()) {
    logger.info('Closing browser singleton gracefully...');
    await _context.close().catch(() => {});
    _context = null;
    _page    = null;
  }
}

// Register shutdown hooks
process.on('SIGINT',  () => closeBrowser().finally(() => process.exit(0)));
process.on('SIGTERM', () => closeBrowser().finally(() => process.exit(0)));

module.exports = {
  setupLogin,
  fetchAllDevices,
  hasSession,
  initBrowserSingleton,
  closeBrowser,
};
