const ExcelJS = require('exceljs');
const { getAllDevices } = require('../db/database');
const logger = require('../utils/logger');

async function generateExcel() {
  const devices = getAllDevices();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Find Hub Tracker';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Devices', {
    pageSetup: { fitToPage: true }
  });

  // Header row styling
  sheet.columns = [
    { header: 'Device Name', key: 'device_name', width: 25 },
    { header: 'Latitude', key: 'latitude', width: 15 },
    { header: 'Longitude', key: 'longitude', width: 15 },
    { header: 'City', key: 'city', width: 18 },
    { header: 'State', key: 'state', width: 18 },
    { header: 'Country', key: 'country', width: 15 },
    { header: 'Battery %', key: 'battery', width: 12 },
    { header: 'Network', key: 'network', width: 20 },
    { header: 'Last Seen', key: 'last_seen_text', width: 20 },
    { header: 'Last Fetch', key: 'last_fetch_time', width: 22 },
    { header: 'Google Maps Link', key: 'maps_link', width: 40 }
  ];

  // Style header
  const headerRow = sheet.getRow(1);
  headerRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A73E8' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FF0D47A1' } }
    };
  });
  headerRow.height = 22;

  // Add data rows
  devices.forEach((device, idx) => {
    const mapsLink = device.latitude && device.longitude
      ? `https://www.google.com/maps?q=${device.latitude},${device.longitude}`
      : '';

    const row = sheet.addRow({
      ...device,
      maps_link: mapsLink,
      last_fetch_time: device.last_fetch_time ? new Date(device.last_fetch_time).toLocaleString() : ''
    });

    // Alternate row colors
    if (idx % 2 === 0) {
      row.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F9FA' } };
      });
    }

    // Make Maps link clickable
    if (mapsLink) {
      const linkCell = row.getCell('maps_link');
      linkCell.value = { text: 'Open in Maps', hyperlink: mapsLink };
      linkCell.font = { color: { argb: 'FF1A73E8' }, underline: true };
    }
  });

  // Auto-filter
  sheet.autoFilter = { from: 'A1', to: `K${devices.length + 1}` };

  logger.info(`Generated Excel with ${devices.length} devices`);
  return workbook;
}

function generateCSV() {
  const devices = getAllDevices();
  const headers = ['Device Name', 'Latitude', 'Longitude', 'City', 'State', 'Country',
                   'Battery %', 'Network', 'Last Seen', 'Last Fetch Time'];

  const rows = devices.map(d => [
    d.device_name, d.latitude, d.longitude, d.city, d.state, d.country,
    d.battery, d.network, d.last_seen_text,
    d.last_fetch_time ? new Date(d.last_fetch_time).toLocaleString() : ''
  ]);

  const csvLines = [headers, ...rows].map(row =>
    row.map(cell => {
      const str = (cell ?? '').toString();
      return str.includes(',') || str.includes('"') || str.includes('\n')
        ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(',')
  );

  return csvLines.join('\n');
}

module.exports = { generateExcel, generateCSV };
