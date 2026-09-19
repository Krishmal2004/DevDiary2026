require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieSession = require("cookie-session");

const authRouter = require("./routes/auth");
const diaryRouter = require("./routes/diary");
const todosRouter = require("./routes/todos");

const app = express();
const port = process.env.PORT || 4000;

app.use(cors({ origin: process.env.APP_BASE_URL || "http://localhost:5173", credentials: true }));
app.use(express.json());
app.use(
  cookieSession({
    name: "devdiary_session",
    secret: process.env.SESSION_SECRET,
    maxAge: 30 * 24 * 60 * 60 * 1000,
    sameSite: "lax",
  })
);

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/auth", authRouter);
app.use("/api/diary", diaryRouter);
app.use("/api/todos", todosRouter);

app.listen(port, () => {
  console.log(`DevDiary2026 backend listening on http://localhost:${port}`);
});
