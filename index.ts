import express from "express";
import cors from "cors";
import { ensureConnected } from "./config/db";
import ideasRouter from "./routes/ideas";
import usersRouter from "./routes/users";
import generateRouter from "./routes/generate";
import blogsRouter from "./routes/blogs";
const app = express();
const port = process.env.PORT || 8000;

app.use(
  cors({
    credentials: true,
    origin: [process.env.CLIENT_URL || "http://localhost:3000"],
  }),
);
app.use(express.json());

// Ensure MongoDB is connected before handling requests
app.use(async (_req, _res, next) => {
  try {
    await ensureConnected();
  } catch {
    // will retry on next request
  }
  next();
});

app.get("/", (_req, res) => {
  const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AreaAlert API</title>
  <link rel="icon" type="image/png" href="${clientUrl}/ideaden-favicon.png">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f8fafc;
      font-family: system-ui, -apple-system, sans-serif;
    }
    .container {
      text-align: center;
      padding: 2rem;
    }
    img {
      max-width: min(280px, 80vw);
      height: auto;
    }
    h1 {
      margin-top: 1.5rem;
      font-size: clamp(1.25rem, 3vw, 1.75rem);
      color: #1e293b;
      font-weight: 600;
    }
    p {
      margin-top: 0.5rem;
      color: #64748b;
      font-size: clamp(0.875rem, 2vw, 1rem);
    }
  </style>
</head>
<body>
  <div class="container">
    <img src="${clientUrl}/ideaden-black.png" alt="IdeaDen">
    <p>AI-Powered Idea and blog post generator</p>
  </div>
</body>
</html>`);
});

app.use("/api/ideas", generateRouter);
app.use("/api/ideas", ideasRouter);
app.use("/api/users", usersRouter);
app.use("/api/blogs", blogsRouter);

if (process.env.NODE_ENV !== "production") {
  app.listen(port, () => {
    console.log(`IdeaDen API listening on port ${port}`);
  });
}

module.exports = app;
