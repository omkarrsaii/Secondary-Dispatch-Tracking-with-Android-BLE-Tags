const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

const dbPath = process.env.DATABASE_URL || './data/devices.db';
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

let db;

function getDb() {
  if (!db) {
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  const database = db;

  database.exec(`
    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_name TEXT NOT NULL UNIQUE,
      latitude TEXT,
      longitude TEXT,
      city TEXT,
      state TEXT,
      country TEXT,
      battery TEXT,
      network TEXT,
      last_seen_text TEXT,
      image_url TEXT,
      last_fetch_time TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS device_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL,
      latitude TEXT,
      longitude TEXT,
      battery TEXT,
      network TEXT,
      last_seen_text TEXT,
      captured_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (device_id) REFERENCES devices(id)
    );

    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_device_history_device_id ON device_history(device_id);
    CREATE INDEX IF NOT EXISTS idx_device_history_captured_at ON device_history(captured_at);
  `);

  logger.info('Database schema initialized');
}

function upsertDevice(device) {
  const database = getDb();
  const now = new Date().toISOString();

  const existing = database.prepare('SELECT id FROM devices WHERE device_name = ?').get(device.device_name);

  if (existing) {
    database.prepare(`
      UPDATE devices SET
        latitude = ?, longitude = ?, city = ?, state = ?, country = ?,
        battery = ?, network = ?, last_seen_text = ?, image_url = ?,
        last_fetch_time = ?, updated_at = ?
      WHERE device_name = ?
    `).run(
      device.latitude, device.longitude, device.city, device.state, device.country,
      device.battery, device.network, device.last_seen_text, device.image_url,
      now, now, device.device_name
    );
    return existing.id;
  } else {
    const result = database.prepare(`
      INSERT INTO devices (device_name, latitude, longitude, city, state, country,
        battery, network, last_seen_text, image_url, last_fetch_time, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      device.device_name, device.latitude, device.longitude, device.city,
      device.state, device.country, device.battery, device.network,
      device.last_seen_text, device.image_url, now, now, now
    );
    return result.lastInsertRowid;
  }
}

function insertHistory(deviceId, data) {
  const database = getDb();
  database.prepare(`
    INSERT INTO device_history (device_id, latitude, longitude, battery, network, last_seen_text)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(deviceId, data.latitude, data.longitude, data.battery, data.network, data.last_seen_text);
}

function getAllDevices() {
  return getDb().prepare('SELECT * FROM devices ORDER BY device_name').all();
}

function getDeviceById(id) {
  return getDb().prepare('SELECT * FROM devices WHERE id = ?').get(id);
}

function getDeviceByName(name) {
  return getDb().prepare('SELECT * FROM devices WHERE device_name = ?').get(name);
}

function getDeviceHistory(deviceId, limit = 100) {
  return getDb().prepare(`
    SELECT * FROM device_history
    WHERE device_id = ?
    ORDER BY captured_at DESC
    LIMIT ?
  `).all(deviceId, limit);
}

function getAppState(key) {
  const row = getDb().prepare('SELECT value FROM app_state WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setAppState(key, value) {
  const database = getDb();
  const now = new Date().toISOString();
  database.prepare(`
    INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, value, now);
}

module.exports = {
  getDb,
  upsertDevice,
  insertHistory,
  getAllDevices,
  getDeviceById,
  getDeviceByName,
  getDeviceHistory,
  getAppState,
  setAppState
};
