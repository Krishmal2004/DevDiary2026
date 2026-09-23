const express = require("express");
const db = require("../db");
const requireAuth = require("../middleware/requireAuth");
const { normalizeDueDate, normalizeUrl } = require("../validation");

const router = express.Router();
router.use(requireAuth);

function findTodo(userId, id) {
  return db.prepare("SELECT * FROM todos WHERE id = ? AND user_id = ?").get(id, userId);
}

router.get("/", (req, res) => {
  const todos = db
    .prepare("SELECT * FROM todos WHERE user_id = ? ORDER BY done ASC, (due_date IS NULL), due_date ASC, id ASC")
    .all(req.user.id);
  res.json(todos);
});

router.post("/", (req, res) => {
  const { title, due_date, linked_url } = req.body;
  if (typeof title !== "string" || !title.trim()) {
    return res.status(400).json({ error: "title is required" });
  }
  const dueDate = normalizeDueDate(due_date ?? null);
  if (dueDate === undefined) {
    return res.status(400).json({ error: "due_date must be YYYY-MM-DD or an ISO timestamp" });
  }
  const linkedUrl = normalizeUrl(linked_url ?? null);
  if (linkedUrl === undefined) {
    return res.status(400).json({ error: "linked_url must be an http(s) URL" });
  }

  const result = db
    .prepare("INSERT INTO todos (user_id, title, due_date, linked_url) VALUES (?, ?, ?, ?)")
    .run(req.user.id, title.trim(), dueDate, linkedUrl);
  res.status(201).json(findTodo(req.user.id, result.lastInsertRowid));
});

router.put("/:id", (req, res) => {
  const existing = findTodo(req.user.id, req.params.id);
  if (!existing) return res.status(404).json({ error: "not found" });

  const { title, due_date, done, linked_url } = req.body;

  if (title !== undefined && (typeof title !== "string" || !title.trim())) {
    return res.status(400).json({ error: "title cannot be empty" });
  }
  const dueDate = due_date !== undefined ? normalizeDueDate(due_date) : existing.due_date;
  if (dueDate === undefined) {
    return res.status(400).json({ error: "due_date must be YYYY-MM-DD or an ISO timestamp" });
  }
  const linkedUrl = linked_url !== undefined ? normalizeUrl(linked_url) : existing.linked_url;
  if (linkedUrl === undefined) {
    return res.status(400).json({ error: "linked_url must be an http(s) URL" });
  }

  // Moving the due date re-arms the reminder.
  const reminderSentAt = dueDate !== existing.due_date ? null : existing.reminder_sent_at;

  db.prepare(
    `UPDATE todos SET
      title = ?,
      due_date = ?,
      done = ?,
      linked_url = ?,
      reminder_sent_at = ?,
      updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    title !== undefined ? title.trim() : existing.title,
    dueDate,
    done !== undefined ? (done ? 1 : 0) : existing.done,
    linkedUrl,
    reminderSentAt,
    existing.id
  );

  res.json(findTodo(req.user.id, existing.id));
});

router.delete("/:id", (req, res) => {
  const result = db.prepare("DELETE FROM todos WHERE id = ? AND user_id = ?").run(req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: "not found" });
  res.status(204).end();
});

module.exports = router;
