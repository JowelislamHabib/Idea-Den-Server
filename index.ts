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
  })
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
  res.json({ status: "ok", service: "IdeaDen API" });
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
