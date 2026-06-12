FROM mcr.microsoft.com/playwright:v1.44.0-jammy

WORKDIR /app

# Install Node deps for backend
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

# Install Playwright browsers
RUN cd backend && npx playwright install chromium --with-deps

# Install and build admin frontend
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci

COPY frontend/ ./frontend/
RUN cd frontend && npm run build

# Install and build client-tracker frontend
COPY client-tracker/package*.json ./client-tracker/
RUN cd client-tracker && npm ci

COPY client-tracker/ ./client-tracker/
RUN cd client-tracker && npm run build

# Copy backend source
COPY backend/ ./backend/

# Create data directory
RUN mkdir -p /app/backend/data /app/backend/logs

EXPOSE 5000

ENV NODE_ENV=production
ENV PORT=5000

WORKDIR /app/backend
CMD ["node", "src/index.js"]
