# Changes & New Features

## Summary

A new **Client Tracker** portal has been added alongside the existing admin dashboard.
Clients and distributors can look up any invoice number to see the assigned vehicle's
live GPS location — without accessing the admin dashboard at all.

The existing admin dashboard (`/frontend`) and all its behaviour are **completely unchanged**.

---

## Architecture After This Change

```
find-hub/
├── backend/
│   ├── data/
│   │   ├── invoice-mapping.json          ← NEW  invoice → vehicle mapping
│   │   └── vehicle-device-mapping.json   ← NEW  vehicle → device mapping
│   └── src/
│       ├── index.js                      ← MODIFIED  (CORS + invoice route mount)
│       ├── db/database.js                ← MODIFIED  (added getDeviceByName)
│       ├── routes/
│       │   ├── api.js                    ← UNCHANGED
│       │   └── invoice.js                ← NEW  /api/invoice/* endpoints
│       └── services/
│           └── mappingService.js         ← NEW  loads + resolves mappings
├── frontend/          ← UNCHANGED (admin dashboard)
├── client-tracker/    ← NEW standalone React app
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── api.js
│       ├── index.css
│       └── components/
│           ├── SearchBar.jsx
│           ├── ResultCard.jsx
│           ├── MapView.jsx
│           └── ErrorCard.jsx
├── Dockerfile          ← MODIFIED  (builds client-tracker too)
├── docker-compose.yml  ← MODIFIED  (comments updated)
└── package.json        ← MODIFIED  (added client-tracker scripts)
```

---

## New API Endpoints

| Method | Endpoint                                    | Description                              |
|--------|---------------------------------------------|------------------------------------------|
| GET    | `/api/invoice/track/:invoiceNo`             | Track invoice (URL param)                |
| POST   | `/api/invoice/track`                        | Track invoice (body `{ invoiceNo }`)     |
| GET    | `/api/invoice/mappings/invoices`            | List all invoice→vehicle mappings        |
| GET    | `/api/invoice/mappings/vehicles`            | List all vehicle→device mappings         |
| POST   | `/api/invoice/mappings/import/invoices`     | Import invoice mappings from CSV         |
| POST   | `/api/invoice/mappings/import/vehicles`     | Import vehicle→device mappings from CSV  |

### Example response — `GET /api/invoice/track/5351225255`

```json
{
  "success": true,
  "data": {
    "invoiceNo":  "5351225255",
    "vehicleNo":  "TS08UL0584",
    "deviceName": "device1",
    "meta": {
      "customerCode": "14673",
      "chainName":    "LULU INTERNATIONAL",
      "destination":  "Kukatpally"
    },
    "location": {
      "latitude":   17.4849,
      "longitude":  78.3960,
      "city":       "Hyderabad",
      "state":      "Telangana",
      "country":    "India",
      "address":    "Hyderabad, Telangana, India",
      "lastSeen":   "3 minutes ago",
      "battery":    "82",
      "network":    "4G LTE",
      "updatedAt":  "2026-06-09T10:23:00.000Z"
    },
    "mapsUrl":   "https://www.google.com/maps?q=17.4849,78.3960",
    "trackedAt": "2026-06-09T10:25:14.123Z"
  }
}
```

---

## Backend Modifications (detail)

### `backend/src/db/database.js`
- Added `getDeviceByName(name)` — looks up a device row by `device_name` (the key used in `vehicle-device-mapping.json`).
- Exported in `module.exports`.

### `backend/src/index.js`
- CORS now accepts **two** origins:
  - `FRONTEND_URL` (default `http://localhost:5173`) — admin dashboard
  - `CLIENT_TRACKER_URL` (default `http://localhost:5174`) — client portal
- Mounts `invoiceRoutes` at `/api/invoice`.
- In production, serves `client-tracker/dist` at path `/track/*`.

---

## Mapping Data Files

### `backend/data/invoice-mapping.json`
Maps invoice numbers to vehicle numbers. Structure:

```json
{
  "mappings": [
    { "invoiceNo": "5351225255", "vehicleNo": "TS08UL0584",
      "customerCode": "14673", "chainName": "LULU INTERNATIONAL", "location": "Kukatpally" }
  ]
}
```

To bulk-import from a CSV file (headers: `Invoice No`, `Vehicle No.`, `Customer`, `Chain Name`, `Location`):

```bash
curl -X POST http://localhost:5000/api/invoice/mappings/import/invoices \
  -H 'Content-Type: application/json' \
  -d '{ "csvPath": "/absolute/path/to/invoices.csv" }'
```

### `backend/data/vehicle-device-mapping.json`
Maps vehicle numbers to device names. `deviceName` **must** match the `device_name` field stored in the SQLite `devices` table (i.e., whatever name appears in Google Find Hub):

```json
{
  "mappings": [
    { "vehicleNo": "TS08UL0584", "deviceName": "device1" }
  ]
}
```

Both JSON files are **hot-reloaded** — update them and the next API call picks up the change immediately, no restart needed.

---

## Client Tracker Frontend

### Running in development

```bash
# Terminal 1 — backend (must already be running)
cd backend && npm run dev

# Terminal 2 — client tracker
cd client-tracker && npm install && npm run dev
# Opens at http://localhost:5174
```

### Building for production

```bash
npm run build          # builds both frontend/ and client-tracker/
# or individually:
npm run build:admin    # admin dashboard only
npm run build:client   # client tracker only
```

In production (Docker or bare-metal), the backend serves:
- `http://your-host/`       → Admin dashboard  
- `http://your-host/track/` → Client tracker portal

### UI Flow

1. User lands on the portal and sees a branded search bar.
2. User types any invoice number (e.g. `5351225255`) and taps **Track**.
3. The app calls `GET /api/invoice/track/:invoiceNo`.
4. A result card appears showing:
   - Invoice number, vehicle number, device ID
   - Chain name and destination from the mapping file
   - City / state / country of current location
   - Last seen timestamp, battery %, network type
   - "Open in Google Maps" deep-link
5. Below the card, an interactive Leaflet map (OpenStreetMap tiles) shows a live pulsing marker at the device's coordinates.
6. A **Refresh now** link re-runs the same query.

---

## Environment Variables (additions)

Add to `backend/.env` if deploying client-tracker on a different origin:

```env
CLIENT_TRACKER_URL=https://track.your-domain.com
```

---

## Adding New Invoices / Vehicles

Edit `backend/data/invoice-mapping.json` and/or `backend/data/vehicle-device-mapping.json` directly —
or POST a CSV path to the import endpoints above.
No server restart required.
