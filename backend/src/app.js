const path = require("node:path");
const fs = require("node:fs");
const express = require("express");
const cors = require("cors");
const cookieSession = require("cookie-session");

const authRouter = require("./routes/auth");
const vscodeAuthRouter = require("./routes/vscodeAuth");
const tokensRouter = require("./routes/tokens");
const diaryRouter = require("./routes/diary");
const todosRouter = require("./routes/todos");
const githubRouter = require("./routes/github");
const webhooksRouter = require("./routes/webhooks");

const FRONTEND_DIST = path.resolve(__dirname, "../../frontend/dist");

function createApp() {
  if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET is not set — copy backend/.env.example to backend/.env and fill it in");
  }

  const app = express();
  const secureCookies = (process.env.BACKEND_BASE_URL || "").startsWith("https://");

  // Behind a hosting provider's TLS proxy (Render, Railway, Fly.io) this is
  // needed for secure cookies to be set.
  app.set("trust proxy", 1);

  // Webhooks need the raw request body for signature checks, so they're
  // mounted before the JSON parser and without CORS or sessions.
  app.use("/webhooks", webhooksRouter);

  app.use(cors({ origin: process.env.APP_BASE_URL || "http://localhost:5173", credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(
    cookieSession({
      name: "devdiary_session",
      secret: process.env.SESSION_SECRET,
      maxAge: 30 * 24 * 60 * 60 * 1000,
      sameSite: "lax",
      secure: secureCookies,
      httpOnly: true,
    })
  );

  app.get("/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/auth/vscode", vscodeAuthRouter);
  app.use("/auth/tokens", tokensRouter);
  app.use("/auth", authRouter);
  app.use("/api/diary", diaryRouter);
  app.use("/api/todos", todosRouter);
  app.use("/api/github", githubRouter);

  app.use("/api", (req, res) => {
    res.status(404).json({ error: "not found" });
  });

  // In production the backend also serves the built dashboard, so the app
  // runs on a single origin. In development Vite serves it instead.
  if (fs.existsSync(path.join(FRONTEND_DIST, "index.html"))) {
    app.use(express.static(FRONTEND_DIST));
    app.get("*", (req, res) => {
      res.sendFile(path.join(FRONTEND_DIST, "index.html"));
    });
  }

  app.use((err, req, res, next) => {
    if (err.type === "entity.parse.failed") {
      return res.status(400).json({ error: "invalid JSON body" });
    }
    console.error(err);
    res.status(500).json({ error: "internal server error" });
  });

  return app;
}

module.exports = { createApp };
