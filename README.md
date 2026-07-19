<p align="center">
  <img src="https://ideaden.vercel.app/ideaden-white.png" alt="IdeaDen Logo" width="200" />
</p>

<p align="center">
  <strong>REST API for the IdeaDen AI-powered idea and blog generation platform</strong>
</p>

<p align="center">
  <a href="https://ideaden-server.vercel.app/">
    <img src="https://img.shields.io/badge/Live_API-Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white" alt="Live API" />
  </a>
  <img src="https://img.shields.io/badge/Express_5-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express 5" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white" alt="MongoDB" />
  <img src="https://img.shields.io/badge/Gemini_AI-8E75B2?style=for-the-badge&logo=google&logoColor=white" alt="Gemini AI" />
</p>

---

## Overview

This is the backend API for **IdeaDen**, an AI-powered platform that generates structured project ideas and SEO-optimized blog content. It handles idea/blog CRUD operations, Gemini AI integration, JWT authentication via JWKS, rate limiting, daily quotas, and user profile management. Authentication is delegated to the frontend via JWKS — this API never handles passwords or sessions directly.

The frontend repository is at [Idea-Den](https://github.com/JowelislamHabib/Idea-Den).

---

## Tech Stack

| Category         | Technology                             |
| ---------------- | -------------------------------------- |
| Runtime          | Node.js                                |
| Framework        | Express 5                              |
| Language         | TypeScript 5                           |
| Database         | MongoDB 7 (native driver, no Mongoose) |
| AI               | Google Gemini Flash Lite (REST API)    |
| JWT Verification | jose v6 (JWKS)                         |
| Build Tool       | esbuild                                |
| Dev Runner       | tsx (watch mode)                       |
| Deployment       | Vercel (serverless)                    |

---

## Project Structure

```
ideaden-server/
├── index.ts                   # Express app entry point
├── api/index.js               # esbuild output (gitignored), Vercel runs this
├── config/db.ts               # MongoDB connection + collection exports
├── middleware/
│   ├── verifyToken.ts         # JWT verification via remote JWKS
│   └── errorHandler.ts        # Global error handler
├── routes/
│   ├── generate.ts            # POST /api/ideas/generate (Gemini idea gen)
│   ├── ideas.ts               # GET/POST/DELETE /api/ideas CRUD
│   ├── blogs.ts               # GET/POST/DELETE /api/blogs CRUD
│   └── users.ts               # GET/PUT /api/users/profile
├── services/
│   ├── gemini.ts              # Gemini integration for project ideas
│   └── gemini-blog.ts         # Gemini integration for blog content
├── types/index.ts             # Shared TypeScript interfaces
├── vercel.json                # Vercel routing config
├── package.json
├── tsconfig.json
└── .env                       # MONGODB_URI, GEMINI_API_KEY, CLIENT_URL, PORT
```

The API is organized into separated route, middleware, and service modules — unlike the single-file approach, this project follows a modular architecture with concerns separated across files.

---

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB instance (Atlas or local)
- Google Gemini API key
- Frontend running at `http://localhost:3000` (for JWKS auth)

### Setup

```bash
git clone https://github.com/JowelislamHabib/Idea-Den-Server.git
cd idea-den-server
npm install
```

Create a `.env` file:

```env
MONGODB_URI=your_mongodb_connection_string
GEMINI_API_KEY=your_gemini_api_key
CLIENT_URL=http://localhost:3000
PORT=8000
```

### Development

```bash
npm run dev
```

Starts with `tsx watch index.ts` — hot-reload on save, no build step needed. Runs on [http://localhost:8000](http://localhost:8000).

### Build and Start

```bash
npm run build   # esbuild bundles to api/index.js
npm start       # runs the compiled output
```

---

## API Endpoints

### Ideas (`/api/ideas`)

| Method | Path                  | Auth | Description                                         |
| ------ | --------------------- | ---- | --------------------------------------------------- |
| GET    | `/api/ideas`          | No   | List public ideas (paginated, filterable, sortable) |
| GET    | `/api/ideas/mine`     | Yes  | Get current user's ideas                            |
| GET    | `/api/ideas/quota`    | Yes  | Check daily generation quota                        |
| GET    | `/api/ideas/:id`      | No   | Get single idea by ObjectId (with related ideas)    |
| POST   | `/api/ideas/generate` | Yes  | Generate a new project idea via Gemini AI           |
| DELETE | `/api/ideas/:id`      | Yes  | Delete own idea                                     |

### Blogs (`/api/blogs`)

| Method | Path                  | Auth | Description                                         |
| ------ | --------------------- | ---- | --------------------------------------------------- |
| GET    | `/api/blogs`          | No   | List public blogs (paginated, filterable, sortable) |
| GET    | `/api/blogs/mine`     | Yes  | Get current user's blogs                            |
| GET    | `/api/blogs/quota`    | Yes  | Check daily generation quota                        |
| GET    | `/api/blogs/:id`      | No   | Get single blog by ObjectId                         |
| POST   | `/api/blogs/generate` | Yes  | Generate a new blog article via Gemini AI           |
| DELETE | `/api/blogs/:id`      | Yes  | Delete own blog                                     |

### Users (`/api/users`)

| Method | Path                 | Auth | Description                                  |
| ------ | -------------------- | ---- | -------------------------------------------- |
| GET    | `/api/users/profile` | Yes  | Get user profile                             |
| PUT    | `/api/users/profile` | Yes  | Update profile (name, developer preferences) |

### Query Parameters (GET /api/ideas)

| Param               | Type   | Description                                |
| ------------------- | ------ | ------------------------------------------ |
| `q`                 | string | Full-text search (title, pitch)            |
| `estimatedDuration` | string | `1-week`, `2-weeks`, `1-month`, `2-months` |
| `sort`              | string | `newest` (default) or `oldest`             |
| `page`              | number | Page number (default: 1)                   |
| `limit`             | number | Results per page (default: 12)             |

### Query Parameters (GET /api/blogs)

| Param      | Type   | Description                     |
| ---------- | ------ | ------------------------------- |
| `q`        | string | Full-text search (title, topic) |
| `template` | string | Filter by blog template type    |
| `sort`     | string | `newest` (default) or `oldest`  |
| `page`     | number | Page number (default: 1)        |
| `limit`    | number | Results per page (default: 12)  |

### Generate Endpoint Request Body

**POST /api/ideas/generate**

```json
{
  "interests": "a gamified education app for kids",
  "timeAvailable": "2-months",
  "techStack": ["React", "Node.js", "MongoDB"]
}
```

**POST /api/blogs/generate**

```json
{
  "topic": "The Future of AI in Web Development",
  "template": "Thought Leadership",
  "tone": "Professional",
  "length": "Medium",
  "keywords": ["AI", "web development", "machine learning"]
}
```

---

## Authentication

This API does not manage user sessions. It verifies JWTs issued by the frontend's Better Auth instance.

### How It Works

1. Frontend extracts a JWT from the Better Auth session
2. Frontend sends the token as `Authorization: Bearer <token>` in API requests
3. Backend fetches the JWKS from `${CLIENT_URL}/api/auth/jwks`
4. `verifyToken` middleware validates the JWT using `jose`'s `jwtVerify` with the remote JWKS
5. Decoded user payload is attached to `req.user`

### Middleware

| Middleware    | Purpose                                      |
| ------------- | -------------------------------------------- |
| `verifyToken` | Validates JWT via remote JWKS, attaches user |

The `verifyToken` middleware is used on all protected routes. User roles (`free`, `pro`) are checked against the `user` collection in MongoDB for quota enforcement.

---

## Database

Database name: `IdeaDen`

| Collection | Purpose                                                       |
| ---------- | ------------------------------------------------------------- |
| `ideas`    | All generated project ideas with full spec, owner info, votes |
| `blogs`    | All generated blog articles with markdown content             |
| `user`     | User accounts (managed by Better Auth on the frontend)        |

The backend reads from `user` to check roles and developer preferences. All user creation/login is handled by Better Auth on the frontend.

### Idea Schema

```typescript
{
  _id: ObjectId,
  projectTitle: string,
  tagline: string,
  theProblem: string,
  targetAudience: string[],
  theSolution: string,
  keyFeatures: { name: string, description: string }[],
  recommendedTechStack: { category: string, details: string }[],
  competitors: { name: string, differentiation: string }[],
  whyBuildThis: { title: string, description: string }[],
  firstSteps: string[],
  techStack: string[],
  elevatorPitch: string,
  estimatedDuration: string,
  ownerId: string,
  ownerName: string,
  ownerEmail: string,
  visibility: "public",
  createdAt: Date,
  updatedAt: Date
}
```

### Blog Schema

```typescript
{
  _id: ObjectId,
  title: string,
  seoMetaDescription: string,
  content: string,           // Markdown formatted
  topic: string,
  template: string,
  tone: string,
  length: string,
  keywords: string[],
  ownerId: string,
  ownerName: string,
  ownerEmail: string,
  createdAt: Date,
  updatedAt: Date
}
```

---

## Rate Limiting & Quotas

- **Per-user cooldown**: 15-second in-memory rate limit between consecutive generations
- **Daily quota**: 3 ideas/day and 3 blogs/day for free users (tracked separately)
- **Pro bypass**: Unlimited generation for Pro tier users
- **Reset**: Quotas reset automatically at midnight UTC

---

## Deployment

Deployed on Vercel as a serverless function.

### vercel.json

```json
{
  "buildCommand": "npx esbuild index.ts --bundle --platform=node --outfile=api/index.js --external:express --external:cors --external:mongodb --external:dotenv",
  "rewrites": [{ "source": "/(.*)", "destination": "/api" }]
}
```

### Build Process

1. `npm run build` runs esbuild, bundling `index.ts` into `api/index.js`
2. Vercel deploys `api/index.js` as a serverless function
3. In production, the app does not start an HTTP listener — it exports the Express app for Vercel's handler

### Key Details

- esbuild externalizes `express`, `cors`, `mongodb`, and `dotenv` (provided by the runtime)
- `CLIENT_URL` env var should point to the frontend's production URL in deployed environments
- Gemini API uses raw `fetch()` (no Google SDK), with `responseMimeType: "application/json"`

---

## Scripts

| Command         | What It Does                                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run dev`   | `tsx watch index.ts` — hot-reload dev server                                                                                               |
| `npm run build` | `esbuild index.ts --bundle --platform=node --outfile=api/index.js --external:express --external:cors --external:mongodb --external:dotenv` |
| `npm start`     | `node api/index.js` — runs compiled output                                                                                                 |

---

## License

ISC
