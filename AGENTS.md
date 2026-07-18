# IdeaDen Server — Agent Guide

**What:** Express 5 backend. Port 8000. CommonJS. Vercel serverless function.

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | tsx watch (port 8000) |
| `npm run build` | esbuild → `api/index.js` |
| `npm start` | Run built serverless entry |

No tests. No typecheck script.

## Architecture

- **Entry:** `index.ts` — Express app. Exports `module.exports = app` for Vercel.
- **DB:** Native MongoDB driver (no ORM). `IdeaDen` database. Collections: `ideas`, `blogs`, `user`.
- **Auth:** JWT verification via `middleware/verifyToken.ts`. Uses `jose` + remote JWKS from `{CLIENT_URL}/api/auth/jwks`. Sets `req.user` with `sub` (userId), `email`, `role`.
- **Deploy:** `vercel.json` rewrites all routes → `/api`. Build: `npx esbuild index.ts --bundle --platform=node --outfile=api/index.js --external:express --external:cors --external:mongodb --external:dotenv`.

## Routes

Endpoints with `†` require `Authorization: Bearer <token>` header (verified via JWKS).

| Prefix | File | Endpoints |
|--------|------|-----------|
| `/api/ideas` | `routes/generate.ts` | `POST /generate`† — Gemini idea gen |
| `/api/ideas` | `routes/ideas.ts` | `GET /` (public), `GET /mine`†, `GET /quota`†, `GET /:id` (public), `DELETE /:id`† |
| `/api/blogs` | `routes/blogs.ts` | `GET /` (public), `GET /mine`†, `GET /quota`†, `GET /:id` (public), `POST /generate`†, `DELETE /:id`† |
| `/api/users` | `routes/users.ts` | `GET /profile`†, `PUT /profile`† |

## Gemini

- Two services: `services/gemini.ts` (ideas blueprint JSON), `services/gemini-blog.ts` (blog JSON with markdown)
- Model: `gemini-flash-lite`. Raw `fetch()` (no Google SDK). `responseMimeType: "application/json"`.
- Key from `GEMINI_API_KEY` env var.

## Env

- `.env` gitignored. Required: `MONGODB_URI`, `GEMINI_API_KEY`, `CLIENT_URL` (default `http://localhost:3000`).
- `dotenv/config` imported first in `config/db.ts`. tsx/esbuild hoists `import` above `require`.

## Quirks

- **JWT payload** from BetterAuth uses `sub` for user ID, plus `email`, `role`, `name`. Always verify via JWKS; never trust client-supplied userId.
- **User lookup:** Dual query `${or: [{_id: ObjectId(userId)}, {id: userId}]}` — Better Auth stores `id` as string, not ObjectId.
- **Rate limits per user:** 15s cooldown (in-memory Map, resets on restart) + 3/day per-type quota (counted in MongoDB).
- **Error handler:** `middleware/errorHandler.ts` — logs + 500. Not wired to Express by default.
- **Build output** `api/index.js` is gitignored.
