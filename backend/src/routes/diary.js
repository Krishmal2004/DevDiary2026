const express = require("express");
const db = require("../db");

const router = express.Router();

router.get("/", (req, res) => {
  const entries = db.prepare("SELECT * FROM diary_entries ORDER BY entry_date DESC").all();
  res.json(entries);
});

router.post("/", (req, res) => {
  const { entry_date, content } = req.body;
  if (!entry_date || !content) {
    return res.status(400).json({ error: "entry_date and content are required" });
  }
  const result = db
    .prepare("INSERT INTO diary_entries (entry_date, content) VALUES (?, ?)")
    .run(entry_date, content);
  const entry = db.prepare("SELECT * FROM diary_entries WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json(entry);
});

router.put("/:id", (req, res) => {
  const { content } = req.body;
  db.prepare("UPDATE diary_entries SET content = ?, updated_at = datetime('now') WHERE id = ?").run(
    content,
    req.params.id
  );
  const entry = db.prepare("SELECT * FROM diary_entries WHERE id = ?").get(req.params.id);
  if (!entry) return res.status(404).json({ error: "not found" });
  res.json(entry);
});

router.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM diary_entries WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

module.exports = router;
