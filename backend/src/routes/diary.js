const express = require("express");
const db = require("../db");
const requireAuth = require("../middleware/requireAuth");
const { isValidDateString } = require("../validation");

const router = express.Router();
router.use(requireAuth);

function findEntry(userId, id) {
  return db.prepare("SELECT * FROM diary_entries WHERE id = ? AND user_id = ?").get(id, userId);
}

// Optional ?from=YYYY-MM-DD&to=YYYY-MM-DD (inclusive) narrows the range,
// e.g. to the month shown in the calendar.
router.get("/", (req, res) => {
  const { from, to } = req.query;
  if ((from && !isValidDateString(from)) || (to && !isValidDateString(to))) {
    return res.status(400).json({ error: "from/to must be YYYY-MM-DD" });
  }
  const entries = db
    .prepare(
      `SELECT * FROM diary_entries
       WHERE user_id = ?
         AND (? IS NULL OR entry_date >= ?)
         AND (? IS NULL OR entry_date <= ?)
       ORDER BY entry_date DESC`
    )
    .all(req.user.id, from || null, from || null, to || null, to || null);
  res.json(entries);
});

router.get("/date/:date", (req, res) => {
  if (!isValidDateString(req.params.date)) {
    return res.status(400).json({ error: "date must be YYYY-MM-DD" });
  }
  const entry = db
    .prepare("SELECT * FROM diary_entries WHERE user_id = ? AND entry_date = ?")
    .get(req.user.id, req.params.date);
  if (!entry) return res.status(404).json({ error: "not found" });
  res.json(entry);
});

// One entry per day: posting for a date that already has an entry replaces
// its content.
router.post("/", (req, res) => {
  const { entry_date, content } = req.body;
  if (!isValidDateString(entry_date) || typeof content !== "string" || !content.trim()) {
    return res.status(400).json({ error: "entry_date (YYYY-MM-DD) and content are required" });
  }

  const existing = db
    .prepare("SELECT id FROM diary_entries WHERE user_id = ? AND entry_date = ?")
    .get(req.user.id, entry_date);
  if (existing) {
    db.prepare("UPDATE diary_entries SET content = ?, updated_at = datetime('now') WHERE id = ?").run(
      content,
      existing.id
    );
    return res.json(findEntry(req.user.id, existing.id));
  }

  const result = db
    .prepare("INSERT INTO diary_entries (user_id, entry_date, content) VALUES (?, ?, ?)")
    .run(req.user.id, entry_date, content);
  res.status(201).json(findEntry(req.user.id, result.lastInsertRowid));
});

router.put("/:id", (req, res) => {
  const { content } = req.body;
  if (typeof content !== "string" || !content.trim()) {
    return res.status(400).json({ error: "content is required" });
  }
  if (!findEntry(req.user.id, req.params.id)) {
    return res.status(404).json({ error: "not found" });
  }
  db.prepare("UPDATE diary_entries SET content = ?, updated_at = datetime('now') WHERE id = ?").run(
    content,
    req.params.id
  );
  res.json(findEntry(req.user.id, req.params.id));
});

router.delete("/:id", (req, res) => {
  const result = db
    .prepare("DELETE FROM diary_entries WHERE id = ? AND user_id = ?")
    .run(req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: "not found" });
  res.status(204).end();
});

module.exports = router;
