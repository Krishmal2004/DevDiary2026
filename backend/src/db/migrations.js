// Schema migrations, tracked with SQLite's built-in `user_version` pragma.
// Each migration runs once, in order, inside a transaction. Append new
// migrations to the end of the list — never edit or reorder existing ones.

function columnExists(db, table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
}

function addColumn(db, table, column, definition) {
  if (!columnExists(db, table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

const migrations = [
  // 1 — base tables (matches the original prototype schema, so existing
  // databases created before migrations existed upgrade cleanly).
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS diary_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_date TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS todos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        due_date TEXT,
        done INTEGER NOT NULL DEFAULT 0,
        linked_url TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        github_id INTEGER NOT NULL UNIQUE,
        username TEXT NOT NULL,
        avatar_url TEXT,
        access_token TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  },

  // 2 — per-user ownership, reminder settings, and GitHub token refresh.
  (db) => {
    addColumn(db, "diary_entries", "user_id", "INTEGER REFERENCES users(id) ON DELETE CASCADE");
    addColumn(db, "todos", "user_id", "INTEGER REFERENCES users(id) ON DELETE CASCADE");
    addColumn(db, "todos", "reminder_sent_at", "TEXT");

    addColumn(db, "users", "email", "TEXT");
    addColumn(db, "users", "reminders_enabled", "INTEGER NOT NULL DEFAULT 1");
    addColumn(db, "users", "timezone", "TEXT");
    addColumn(db, "users", "refresh_token", "TEXT");
    addColumn(db, "users", "token_expires_at", "TEXT");
    addColumn(db, "users", "refresh_token_expires_at", "TEXT");

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_diary_user_date ON diary_entries (user_id, entry_date);
      CREATE INDEX IF NOT EXISTS idx_todos_user ON todos (user_id);
      CREATE INDEX IF NOT EXISTS idx_todos_reminders ON todos (done, reminder_sent_at, due_date);
    `);

    // Rows created before accounts existed have no owner. On a single-user
    // install they clearly belong to that user; otherwise leave them orphaned
    // (invisible) rather than guess.
    const users = db.prepare("SELECT id FROM users").all();
    if (users.length === 1) {
      db.prepare("UPDATE diary_entries SET user_id = ? WHERE user_id IS NULL").run(users[0].id);
      db.prepare("UPDATE todos SET user_id = ? WHERE user_id IS NULL").run(users[0].id);
    }
  },
];

function migrate(db, { log = () => {} } = {}) {
  const current = db.pragma("user_version", { simple: true });
  for (let version = current; version < migrations.length; version++) {
    db.transaction(() => {
      migrations[version](db);
      db.pragma(`user_version = ${version + 1}`);
    })();
    log(`Applied migration ${version + 1}`);
  }
  return db.pragma("user_version", { simple: true });
}

module.exports = { migrate, latestVersion: migrations.length };
