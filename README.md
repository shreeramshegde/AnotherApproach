# Customer Review Intelligence Dashboard

Full-stack dashboard for noisy multilingual reviews with:

- Gemini for fake-review + feature-level sentiment extraction
- Grok for sarcasm / ambiguity detection
- SQLite-backed trust scoring (review, product, consumer)
- Trend and emerging issue detection over time

## Stack

- **Frontend:** React + Vite + Recharts
- **Backend:** Node.js + Express + SQLite (`better-sqlite3`)
- **AI APIs:** Gemini, Grok

## Backend setup

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Set these keys in `backend/.env`:

- `SQLITE_DB_PATH` (default: `data/review_intelligence.sqlite`)
- `GEMINI_API_KEY`
- `GROK_API_KEY`

Data persists in the SQLite file and survives backend restarts.

## SQLite installation process (Arch Linux)

You do **not** need a DB server. Installing backend dependencies already installs the embedded SQLite driver:

```bash
cd backend
npm install
```

Optional (for inspecting DB from terminal):

```bash
sudo pacman -S sqlite
sqlite3 backend/data/review_intelligence.sqlite
```

## Frontend setup

```bash
cd frontend
npm install
npm run dev
```

Frontend uses `/api` proxy to `http://localhost:4000`.

## Main API endpoints

- `POST /api/reviews/import` (CSV/JSON/manual ingest)
- `POST /api/reviews/feed` (simulated realtime feed)
- `POST /api/reviews/:id/analyze` (single-review pipeline)
- `GET /api/reviews` (filter/search)
- `GET /api/dashboard/overview`
- `GET /api/dashboard/trends`
- `GET /api/dashboard/products`
- `GET /api/dashboard/consumers`
- `GET /api/dashboard/health/models`
