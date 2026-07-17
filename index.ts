import express from "express";
import cors from "cors";
import { db } from "./config/db";
import ideasRouter from "./routes/ideas";
import usersRouter from "./routes/users";
import generateRouter from "./routes/generate";

const app = express();
const port = process.env.PORT || 8000;

app.use(
  cors({
    credentials: true,
    origin: [process.env.CLIENT_URL || "http://localhost:3000"],
  })
);
app.use(express.json());

db.command({ ping: 1 })
  .then(() => console.log("MongoDB connected"))
  .catch(console.error);

app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "IdeaDen API" });
});

app.use("/api/ideas", generateRouter);
app.use("/api/ideas", ideasRouter);
app.use("/api/users", usersRouter);

if (process.env.NODE_ENV !== "production") {
  app.listen(port, () => {
    console.log(`IdeaDen API listening on port ${port}`);
  });
}

module.exports = app;
