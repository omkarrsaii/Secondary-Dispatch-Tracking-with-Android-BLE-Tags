# 📍 Find Hub Tracker

Automatically extracts device locations from **Google Find Hub** on a schedule, stores history, and presents a live dashboard with Excel/CSV export.

---

## Architecture

```
find-hub/
├── backend/               # Node.js + Express + Playwright
│   ├── src/
│   │   ├── index.js           # Express server entry point
│   │   ├── setupLogin.js      # One-time Google login helper
│   │   ├── db/database.js     # SQLite schema + helpers
│   │   ├── routes/api.js      # REST API endpoints
│   │   ├── services/
│   │   │   ├── browserService.js   # Playwright automation
│   │   │   ├── fetchService.js     # Orchestrates fetch + save
│   │   │   ├── geocodeService.js   # Nominatim reverse geocode
│   │   │   ├── schedulerService.js # node-cron scheduler
│   │   │   └── exportService.js    # Excel + CSV generation
│   │   └── utils/logger.js    # Winston logger
│   └── data/              # SQLite DB + session (auto-created)
├── frontend/              # React + Vite + TailwindCSS
│   └── src/
│       ├── pages/             # Dashboard, Devices, History, Settings
│       ├── components/        # Sidebar, Header, DeviceRow, StatCard
│       └── hooks/useDevices.js
├── Dockerfile
├── docker-compose.yml
├── ecosystem.config.js    # PM2
└── docker/nginx.conf
```

---

## Quick Start

### 1. Install dependencies

```bash
cd find-hub
npm run install:all
# This runs npm install in both backend/ and frontend/
```

### 2. Install Playwright browsers

```bash
cd backend
npx playwright install chromium
```

### 3. First-time Google login

This opens a real browser for you to log in once. Session is persisted.

```bash
npm run setup-login
```

- A Chromium window opens
- Log into your Google account
- Navigate to https://www.google.com/android/find/
- Wait for your devices to appear in the sidebar
- Press **ENTER** in the terminal
- Session saved to `backend/data/storageState.json`

### 4. Start the backend

```bash
npm start
# or for development with auto-reload:
cd backend && npm run dev
```

### 5. Start the frontend (dev)

```bash
cd frontend && npm run dev
# Opens at http://localhost:5173
```

### 6. Build frontend for production

```bash
npm run build
# Output: frontend/dist/ — served automatically by Express in production
```

---

## Environment Variables

Create `backend/.env` (already provided):

```env
PORT=5000
FETCH_INTERVAL=10          # minutes: 10, 15, 20, 30, 60
DATABASE_URL=./data/devices.db
SESSION_FILE=./data/storageState.json
NOMINATIM_URL=https://nominatim.openstreetmap.org
HEADLESS=true              # false = show browser window
```

---

## REST API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/status` | System status, scheduler, session info |
| GET | `/api/devices` | All tracked devices with latest data |
| GET | `/api/devices/:id` | Single device detail |
| GET | `/api/device/:id/history` | Location history for a device |
| POST | `/api/refresh` | Trigger async fetch (returns immediately) |
| POST | `/api/refresh/sync` | Trigger fetch and wait for result |
| POST | `/api/scheduler` | Update fetch interval `{ interval: 15 }` |
| GET | `/api/export/excel` | Download devices.xlsx |
| GET | `/api/export/csv` | Download devices.csv |

---

## Dashboard Features

- **Summary cards** — Total devices, last sync time, fetch interval, recently active
- **Devices table** — All devices with coordinates, geocoded location, battery, network, last seen
- **Quick location view** — Map tiles per device (Google Static Maps)
- **Device detail** — Full info + battery history chart + location history table
- **History page** — All history records, filterable by device
- **Settings** — Change scheduler interval, manual sync, session status

---

## Docker Deployment

```bash
# First time: copy session into data/ volume
mkdir -p data
cp backend/data/storageState.json data/

# Build and run
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

The `data/` directory is mounted as a volume — your SQLite database and session persist across container restarts.

---

## Ubuntu VPS Deployment

### Install prerequisites

```bash
# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Playwright system dependencies
sudo apt-get install -y libnss3 libatk1.0-0 libatk-bridge2.0-0 \
  libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
  libxfixes3 libxrandr2 libgbm1 libasound2

# PM2
sudo npm install -g pm2

# Nginx + Certbot
sudo apt install -y nginx certbot python3-certbot-nginx
```

### Deploy app

```bash
git clone <your-repo> /app/find-hub
cd /app/find-hub
npm run install:all
npm run build

# Run login setup (requires desktop/VNC for browser window)
npm run setup-login

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### SSL with Nginx

```bash
# Copy nginx config
sudo cp docker/nginx.conf /etc/nginx/sites-available/find-hub
# Edit YOUR_DOMAIN.com in the config file
sudo nano /etc/nginx/sites-available/find-hub
sudo ln -s /etc/nginx/sites-available/find-hub /etc/nginx/sites-enabled/
sudo nginx -t && sudo nginx -s reload

# Get SSL certificate
sudo certbot --nginx -d YOUR_DOMAIN.com
```

---

## Railway / Render Deployment

1. Push to GitHub
2. Create a new service pointing to your repo
3. Set environment variables in the dashboard
4. **Important**: The `data/` directory must be a persistent disk — configure this in Railway/Render settings
5. For the first login, you must run `setup-login` locally and upload `storageState.json` to the persistent disk

---

## Session Expiry

If the Google session expires:

1. The scheduler pauses automatically
2. The dashboard shows a red "Session Expired" banner
3. The API returns `401 SESSION_EXPIRED`

**To fix:**

```bash
cd backend && npm run setup-login
```

Then restart the server. The scheduler resumes automatically.

---

## Logging

Logs are written to `backend/logs/`:
- `combined.log` — all log levels
- `error.log` — errors only

Log entries cover: fetch start/end, device found, coordinates extracted, geocoding, session expiry, scheduler events.

---

## Notes

- **Nominatim rate limit**: 1 request/second (respected automatically). Coordinates are cached in-memory per run.
- **Google Maps Static API**: Used for map preview tiles. If you don't have an API key, the tiles will fail gracefully and show coordinates instead.
- The `data/` directory is in `.gitignore` — never commit your session file.
