# Customer Review Intelligence Dashboard

Full-stack dashboard for noisy multilingual reviews with:

- Gemini-only pipeline for fake-review, sarcasm/ambiguity, and feature-level sentiment extraction
- MongoDB-backed trust scoring (review, product, consumer)
- Trend detection with systemic vs isolated issue classification and anomaly alerts
- Downloadable JSON intelligence report for product and marketing teams

## Stack

- **Frontend:** React + Vite + Recharts
- **Backend:** Node.js + Express + MongoDB (`mongodb`)
- **AI APIs:** Gemini

## Backend setup

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Set these keys in `backend/.env`:

- `MONGODB_URI` (default: `mongodb://127.0.0.1:27017`)
- `MONGODB_DB_NAME` (default: `review_intelligence`)
- `MONGODB_USERNAME` (example: `admin`)
- `MONGODB_PASSWORD` (optional in `.env`; if omitted and username is set, backend prompts at startup)
- `GEMINI_API_KEY`

Run MongoDB locally (example on Arch Linux):

```bash
sudo pacman -S mongodb-bin
sudo systemctl enable --now mongodb
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
- `GET /api/dashboard/report` (download structured report JSON)
