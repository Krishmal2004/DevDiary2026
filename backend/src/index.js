require("dotenv").config();
const express = require("express");
const cors = require("cors");

const diaryRouter = require("./routes/diary");
const todosRouter = require("./routes/todos");

const app = express();
const port = process.env.PORT || 4000;

app.use(cors({ origin: process.env.APP_BASE_URL || "http://localhost:5173" }));
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/diary", diaryRouter);
app.use("/api/todos", todosRouter);

app.listen(port, () => {
  console.log(`DevDiary2026 backend listening on http://localhost:${port}`);
});
