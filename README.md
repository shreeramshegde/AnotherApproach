# Customer Review Intelligence Dashboard

Full-stack dashboard for noisy multilingual reviews with:

- Gemini for fake-review + feature-level sentiment extraction
- Grok for sarcasm / ambiguity detection
- MongoDB-backed trust scoring (review, product, consumer)
- Trend and emerging issue detection over time

## Stack

- **Frontend:** React + Vite + Recharts
- **Backend:** Node.js + Express + MongoDB (Mongoose)
- **AI APIs:** Gemini, Grok

## Backend setup

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Set these keys in `backend/.env`:

- `MONGODB_URI`
- `GEMINI_API_KEY`
- `GROK_API_KEY`

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
