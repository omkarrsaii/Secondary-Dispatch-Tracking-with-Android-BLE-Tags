/**
 * masterDataService.js
 *
 * Manages in-memory Route Master and Organisation Hierarchy data.
 * Both data sources come from Google Sheets and auto-sync on a configurable interval.
 *
 * Data model:
 *   routeEntries  — flat array of { routeName, asmName, distributorCode, distributorName, city }
 *   hierarchyEntries — flat array of hierarchy rows keyed by distributorCode
 *
 * Access helpers expose pre-grouped views (by route, by ASM, by TSOE, etc.)
 * so route and hierarchy routes don't need to do O(n) scans per request.
 */

const logger = require('../utils/logger');
const sheets = require('./sheetsService');

// ─── In-memory stores ─────────────────────────────────────────────────────────

let routeEntries     = [];   // raw route rows
let hierarchyEntries = [];   // raw hierarchy rows
let distLocationEntries = []; // raw distributor lat/long rows

// Pre-built lookup maps (rebuilt on every sync)
let routeMap        = new Map(); // routeName → [entry,...]
let distHierarchyMap = new Map(); // distributorCode → hierarchyEntry
let distLocationMap  = new Map(); // distributorCode → { latitude, longitude, ... }

const syncState = {
  routes: {
    lastSyncAt: null,
    count:      0,
    error:      null,
    syncing:    false,
  },
  hierarchy: {
    lastSyncAt: null,
    count:      0,
    error:      null,
    syncing:    false,
  },
  distributorLocations: {
    lastSyncAt: null,
    count:      0,
    error:      null,
    syncing:    false,
  },
  timer: null,
};

// ─── Index builders ───────────────────────────────────────────────────────────

function rebuildRouteMap(entries) {
  const map = new Map();
  for (const e of entries) {
    if (!map.has(e.routeName)) map.set(e.routeName, []);
    map.get(e.routeName).push(e);
  }
  return map;
}

function rebuildDistMap(entries) {
  const map = new Map();
  for (const e of entries) {
    map.set(e.distributorCode, e);
  }
  return map;
}

// ─── Sync functions ────────────────────────────────────────────────────────────

async function syncRoutes() {
  if (!sheets.isRouteConfigured()) {
    logger.info('masterDataService: ROUTE_SHEET_ID not configured — skipping route sync');
    return { success: false, reason: 'not_configured' };
  }
  if (syncState.routes.syncing) {
    return { success: false, reason: 'already_syncing' };
  }

  syncState.routes.syncing = true;
  syncState.routes.error   = null;

  try {
    const data = await sheets.fetchRouteData();
    routeEntries = data;
    routeMap     = rebuildRouteMap(data);

    syncState.routes.lastSyncAt = new Date().toISOString();
    syncState.routes.count      = data.length;
    logger.info(`masterDataService: route sync complete — ${data.length} entries, ${routeMap.size} routes`);
    return { success: true, entries: data.length, routes: routeMap.size };
  } catch (err) {
    syncState.routes.error = err.message;
    logger.error('masterDataService: route sync failed — ' + err.message);
    return { success: false, error: err.message };
  } finally {
    syncState.routes.syncing = false;
  }
}

async function syncHierarchy() {
  if (!sheets.isHierarchyConfigured()) {
    logger.info('masterDataService: HIERARCHY_SHEET_ID not configured — skipping hierarchy sync');
    return { success: false, reason: 'not_configured' };
  }
  if (syncState.hierarchy.syncing) {
    return { success: false, reason: 'already_syncing' };
  }

  syncState.hierarchy.syncing = true;
  syncState.hierarchy.error   = null;

  try {
    const data = await sheets.fetchHierarchyData();
    hierarchyEntries = data;
    distHierarchyMap = rebuildDistMap(data);

    syncState.hierarchy.lastSyncAt = new Date().toISOString();
    syncState.hierarchy.count      = data.length;
    logger.info(`masterDataService: hierarchy sync complete — ${data.length} entries`);
    return { success: true, entries: data.length };
  } catch (err) {
    syncState.hierarchy.error = err.message;
    logger.error('masterDataService: hierarchy sync failed — ' + err.message);
    return { success: false, error: err.message };
  } finally {
    syncState.hierarchy.syncing = false;
  }
}

async function syncDistributorLocations() {
  if (!sheets.isDistributorLocationConfigured()) {
    logger.info('masterDataService: DISTRIBUTOR_LOCATION_SHEET_ID not configured — skipping distributor-location sync');
    return { success: false, reason: 'not_configured' };
  }
  if (syncState.distributorLocations.syncing) {
    return { success: false, reason: 'already_syncing' };
  }

  syncState.distributorLocations.syncing = true;
  syncState.distributorLocations.error   = null;

  try {
    const data = await sheets.fetchDistributorLocations();
    distLocationEntries = data;
    distLocationMap = new Map(data.map(e => [e.distributorCode, e]));

    syncState.distributorLocations.lastSyncAt = new Date().toISOString();
    syncState.distributorLocations.count      = data.length;
    logger.info(`masterDataService: distributor-location sync complete — ${data.length} entries`);
    return { success: true, entries: data.length };
  } catch (err) {
    syncState.distributorLocations.error = err.message;
    logger.error('masterDataService: distributor-location sync failed — ' + err.message);
    return { success: false, error: err.message };
  } finally {
    syncState.distributorLocations.syncing = false;
  }
}

async function syncAll() {
  const [r, h, l] = await Promise.allSettled([syncRoutes(), syncHierarchy(), syncDistributorLocations()]);
  return {
    routes:    r.status === 'fulfilled' ? r.value : { success: false, error: r.reason?.message },
    hierarchy: h.status === 'fulfilled' ? h.value : { success: false, error: h.reason?.message },
    distributorLocations: l.status === 'fulfilled' ? l.value : { success: false, error: l.reason?.message },
  };
}

// ─── Auto-sync scheduler ──────────────────────────────────────────────────────

function startMasterDataSync(intervalMinutes) {
  const mins = parseInt(intervalMinutes || process.env.SHEET_SYNC_INTERVAL || 5);

  // Immediate first sync
  syncAll().catch(err => logger.error('masterDataService: initial sync error — ' + err.message));

  if (syncState.timer) clearInterval(syncState.timer);
  syncState.timer = setInterval(() => {
    syncAll().catch(err => logger.error('masterDataService: scheduled sync error — ' + err.message));
  }, mins * 60 * 1000);

  logger.info(`masterDataService: auto-sync every ${mins} minute(s)`);
}

// ─── Status ───────────────────────────────────────────────────────────────────

function getMasterDataStatus() {
  return {
    routes: {
      configured:  sheets.isRouteConfigured(),
      ...syncState.routes,
      totalEntries: routeEntries.length,
      totalRoutes:  routeMap.size,
    },
    hierarchy: {
      configured:   sheets.isHierarchyConfigured(),
      ...syncState.hierarchy,
      totalEntries: hierarchyEntries.length,
    },
    distributorLocations: {
      configured:   sheets.isDistributorLocationConfigured(),
      ...syncState.distributorLocations,
      totalEntries: distLocationEntries.length,
    },
  };
}

// ─── Route Queries ────────────────────────────────────────────────────────────

/** Returns array of unique route names with distributor count */
function getAllRoutes() {
  const result = [];
  for (const [routeName, entries] of routeMap.entries()) {
    result.push({
      routeName,
      asmName:          entries[0]?.asmName || '',
      distributorCount: entries.length,
      distributors:     entries.map(e => e.distributorCode),
    });
  }
  return result.sort((a, b) => a.routeName.localeCompare(b.routeName));
}

/** Returns full detail for a single route including hierarchy enrichment */
function getRouteDetail(routeName) {
  const entries = routeMap.get(routeName);
  if (!entries) return null;

  const distributors = entries.map(e => {
    const hier = distHierarchyMap.get(e.distributorCode) || {};
    return {
      distributorCode: e.distributorCode,
      distributorName: e.distributorName || hier.distributorName || '',
      city:            e.city || hier.townCity || '',
      asmName:         e.asmName || hier.asmName || '',
      tsoeName:        hier.tsoeName || '',
      region:          hier.region || '',
      status:          hier.status || '',
    };
  });

  return {
    routeName,
    asmName:          entries[0]?.asmName || '',
    distributorCount: entries.length,
    distributors,
  };
}

/** Get all distributor codes for a specific route */
function getRouteDistributorCodes(routeName) {
  const entries = routeMap.get(routeName) || [];
  return entries.map(e => e.distributorCode);
}

// ─── Hierarchy Queries ────────────────────────────────────────────────────────

/** Get a single distributor's full hierarchy entry */
function getDistributorHierarchy(distributorCode) {
  return distHierarchyMap.get(String(distributorCode).trim()) || null;
}

/** Get a distributor's lat/long entry from the Distributor Location sheet (geofencing). */
function getDistributorLocation(distributorCode) {
  return distLocationMap.get(String(distributorCode || '').trim()) || null;
}

/** Get all distinct zones/regions */
function getAllZones() {
  const zones = new Map();
  for (const e of hierarchyEntries) {
    if (!e.region) continue;
    if (!zones.has(e.region)) {
      zones.set(e.region, { region: e.region, clusters: new Set(), asms: new Set(), distributors: 0 });
    }
    const z = zones.get(e.region);
    if (e.clusterName) z.clusters.add(e.clusterName);
    if (e.asmArea)     z.asms.add(e.asmArea);   // count distinct Areas, not volatile names
    z.distributors++;
  }
  return Array.from(zones.values()).map(z => ({
    region:           z.region,
    clusterCount:     z.clusters.size,
    asmCount:         z.asms.size,
    distributorCount: z.distributors,
  }));
}

/**
 * Get all distinct ASM Areas with their distributors.
 *
 * Grouped by asmArea (the stable territory label) rather than asmName
 * (the person currently holding the role). asmNames accumulates every
 * distinct person-name seen for that area, so callers can still show
 * "currently held by X" without making the Area itself volatile.
 */
function getAllAsms() {
  const asms = new Map();
  for (const e of hierarchyEntries) {
    const key = e.asmArea || '(unassigned)';   // ← stable grouping key (Change 1)
    if (!asms.has(key)) {
      asms.set(key, {
        asmArea:     key,
        asmNames:    new Set(),   // people who hold/have held this area
        region:      e.region      || '',
        clusterName: e.clusterName || '',
        ddTypes:     new Set(),
        tsoes:       new Set(),
        distributors: [],
      });
    }
    const a = asms.get(key);
    if (e.asmName)  a.asmNames.add(e.asmName);
    if (e.ddType)   a.ddTypes.add(e.ddType);
    if (e.tsoeName) a.tsoes.add(e.tsoeName);
    a.distributors.push(e.distributorCode);
  }
  return Array.from(asms.values()).map(a => ({
    ...a,
    asmNames:         Array.from(a.asmNames).filter(Boolean),
    ddTypeCount:      a.ddTypes.size,
    tsoeCount:        a.tsoes.size,
    distributorCount: a.distributors.length,
    ddTypes:          Array.from(a.ddTypes),
    tsoes:            Array.from(a.tsoes),
  }));
}

/** Get all TSOEs with their distributors */
function getAllTsoes() {
  const tsoes = new Map();
  for (const e of hierarchyEntries) {
    const key = e.tsoeName || '(unassigned)';
    if (!tsoes.has(key)) {
      tsoes.set(key, {
        tsoeName:     key,
        asmName:      e.asmName  || '',
        asmArea:      e.asmArea  || '',   // ← stable area reference (Change 1)
        region:       e.region   || '',
        clusterName:  e.clusterName || '',
        distributors: [],
        tsoeMobile:   e.tsoeMobile || '',
      });
    }
    tsoes.get(key).distributors.push(e.distributorCode);
  }
  return Array.from(tsoes.values()).map(t => ({
    ...t,
    distributorCount: t.distributors.length,
  }));
}

/** Get all distributor hierarchy entries */
function getAllDistributors() {
  return hierarchyEntries.map(e => ({
    distributorCode: e.distributorCode,
    distributorName: e.distributorName,
    asmName:         e.asmName,
    tsoeName:        e.tsoeName,
    region:          e.region,
    clusterName:     e.clusterName,
    ddType:          e.ddType,
    asmArea:         e.asmArea,
    townCity:        e.townCity,
    status:          e.status,
    distMobile:      e.distMobile,
    tsoeMobile:      e.tsoeMobile,
  }));
}

/** Build full hierarchy tree: Zone → Cluster → ASM → DD Type → TSOE → Distributor
 *
 * "Cluster" comes from clusterName (the sheet tab a row was read from), NOT
 * from the DD Type column. DD Type (GT/SD/MT) is its own level nested
 * underneath each ASM. ASM Area is attached as metadata on the ASM node
 * (a subtitle), not a separate drill-down level.
 */
function buildHierarchyTree() {
  const tree = new Map(); // zone → cluster → asm → { asmArea, ddTypes: Map(ddType → Map(tsoe → [distributors])) }

  for (const e of hierarchyEntries) {
    const zone    = e.region      || '(unassigned zone)';
    const cluster = e.clusterName || '(unassigned cluster)';
    const asm     = e.asmArea     || '(unassigned ASM)';   // ← stable key (Change 1)
    const ddType  = e.ddType      || '(unassigned DD type)';
    const tsoe    = e.tsoeName    || '(unassigned TSOE)';

    if (!tree.has(zone)) tree.set(zone, new Map());
    const clusterMap = tree.get(zone);

    if (!clusterMap.has(cluster)) clusterMap.set(cluster, new Map());
    const asmMap = clusterMap.get(cluster);

    if (!asmMap.has(asm)) asmMap.set(asm, { asmArea: asm, asmNames: new Set(), ddTypes: new Map() });
    const asmEntry = asmMap.get(asm);
    if (e.asmName) asmEntry.asmNames.add(e.asmName);   // accumulate person-names (Change 1)

    if (!asmEntry.ddTypes.has(ddType)) asmEntry.ddTypes.set(ddType, new Map());
    const tsoeMap = asmEntry.ddTypes.get(ddType);

    if (!tsoeMap.has(tsoe)) tsoeMap.set(tsoe, []);
    tsoeMap.get(tsoe).push({
      distributorCode: e.distributorCode,
      distributorName: e.distributorName,
      townCity:        e.townCity,
      status:          e.status,
    });
  }

  // Serialise Maps → plain objects
  const result = [];
  for (const [zone, clusterMap] of tree) {
    const zoneNode = { zone, clusters: [] };
    for (const [clusterName, asmMap] of clusterMap) {
      const clusterNode = { clusterName, asms: [] };
      for (const [asmArea, asmData] of asmMap) {
        const asmNode = {
          asmArea,                                              // the stable identity (Change 1)
          asmNames: Array.from(asmData.asmNames).filter(Boolean), // current/past holders
          ddTypes: [],
        };
        for (const [ddType, tsoeMap] of asmData.ddTypes) {
          const ddTypeNode = { ddType, tsoes: [] };
          for (const [tsoeName, distributors] of tsoeMap) {
            ddTypeNode.tsoes.push({ tsoeName, distributors });
          }
          asmNode.ddTypes.push(ddTypeNode);
        }
        clusterNode.asms.push(asmNode);
      }
      zoneNode.clusters.push(clusterNode);
    }
    result.push(zoneNode);
  }
  return result;
}

/** Get all distinct clusters (tabs) with their stats */
function getAllClusters() {
  const clusters = new Map();
  for (const e of hierarchyEntries) {
    const key = e.clusterName || '(unassigned)';
    if (!clusters.has(key)) {
      clusters.set(key, { clusterName: key, region: e.region || '', asms: new Set(), distributors: 0 });
    }
    const c = clusters.get(key);
    if (e.asmArea) c.asms.add(e.asmArea);   // count distinct Areas (Change 1)
    c.distributors++;
  }
  return Array.from(clusters.values()).map(c => ({
    clusterName:      c.clusterName,
    region:           c.region,
    asmCount:         c.asms.size,
    distributorCount: c.distributors,
  }));
}

/** Get all distributor codes belonging to a single cluster (tab) — used for cluster-level KPIs */
function getDistributorCodesForCluster(clusterName) {
  const target = String(clusterName || '').trim();
  return hierarchyEntries
    .filter(e => (e.clusterName || '(unassigned)') === target)
    .map(e => e.distributorCode);
}

// ─── Cross-cutting helpers ─────────────────────────────────────────────────────

/** Given a distributor code, find which route it belongs to */
function getDistributorRoute(distributorCode) {
  for (const [routeName, entries] of routeMap.entries()) {
    if (entries.some(e => e.distributorCode === distributorCode)) return routeName;
  }
  return null;
}

/** Global search across routes, distributors, hierarchy */
function searchMasterData(query) {
  const q = String(query || '').toLowerCase().trim();
  if (!q) return { routes: [], distributors: [], hierarchy: [] };

  const matchedRoutes = getAllRoutes().filter(r =>
    r.routeName.toLowerCase().includes(q) ||
    r.asmName.toLowerCase().includes(q)
  );

  const matchedDist = hierarchyEntries.filter(e =>
    e.distributorCode.toLowerCase().includes(q) ||
    e.distributorName.toLowerCase().includes(q) ||
    e.asmName.toLowerCase().includes(q) ||
    e.tsoeName.toLowerCase().includes(q) ||
    e.townCity.toLowerCase().includes(q)
  );

  const matchedRouteEntries = routeEntries.filter(e =>
    e.distributorCode.toLowerCase().includes(q) ||
    e.distributorName.toLowerCase().includes(q)
  );

  return {
    routes:       matchedRoutes,
    distributors: matchedDist,
    routeEntries: matchedRouteEntries,
  };
}

// ─── Raw data access ──────────────────────────────────────────────────────────

function getRawRouteEntries()     { return routeEntries; }
function getRawHierarchyEntries() { return hierarchyEntries; }
function getDistHierarchyMap()    { return distHierarchyMap; }

module.exports = {
  // Sync & lifecycle
  startMasterDataSync,
  syncAll,
  syncRoutes,
  syncHierarchy,
  syncDistributorLocations,
  getMasterDataStatus,

  // Route queries
  getAllRoutes,
  getRouteDetail,
  getRouteDistributorCodes,
  getDistributorRoute,

  // Hierarchy queries
  getDistributorHierarchy,
  getDistributorLocation,
  getAllZones,
  getAllClusters,
  getDistributorCodesForCluster,
  getAllAsms,
  getAllTsoes,
  getAllDistributors,
  buildHierarchyTree,

  // Search
  searchMasterData,

  // Raw
  getRawRouteEntries,
  getRawHierarchyEntries,
  getDistHierarchyMap,
};
