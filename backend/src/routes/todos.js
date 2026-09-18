const express = require("express");
const db = require("../db");

const router = express.Router();

router.get("/", (req, res) => {
  const todos = db.prepare("SELECT * FROM todos ORDER BY (due_date IS NULL), due_date ASC").all();
  res.json(todos);
});

router.post("/", (req, res) => {
  const { title, due_date, linked_url } = req.body;
  if (!title) {
    return res.status(400).json({ error: "title is required" });
  }
  const result = db
    .prepare("INSERT INTO todos (title, due_date, linked_url) VALUES (?, ?, ?)")
    .run(title, due_date || null, linked_url || null);
  const todo = db.prepare("SELECT * FROM todos WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json(todo);
});

router.put("/:id", (req, res) => {
  const { title, due_date, done, linked_url } = req.body;
  const existing = db.prepare("SELECT * FROM todos WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "not found" });

  db.prepare(
    `UPDATE todos SET
      title = ?,
      due_date = ?,
      done = ?,
      linked_url = ?,
      updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    title ?? existing.title,
    due_date !== undefined ? due_date : existing.due_date,
    done !== undefined ? (done ? 1 : 0) : existing.done,
    linked_url !== undefined ? linked_url : existing.linked_url,
    req.params.id
  );

  const todo = db.prepare("SELECT * FROM todos WHERE id = ?").get(req.params.id);
  res.json(todo);
});

router.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM todos WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

module.exports = router;
