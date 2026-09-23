const path = require("node:path");
const fs = require("node:fs");
const Database = require("better-sqlite3");
const { migrate } = require("./migrations");

const dbPath = process.env.DATABASE_PATH || "./data/devdiary.sqlite";
if (dbPath !== ":memory:") {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

// WAL is fastest, but it needs shared memory that network file systems
// (Azure App Service's /home, Azure Files, NFS) don't support. Set
// SQLITE_JOURNAL_MODE=DELETE when the database lives on one of those.
const JOURNAL_MODES = new Set(["WAL", "DELETE", "TRUNCATE", "PERSIST"]);
const journalMode = (process.env.SQLITE_JOURNAL_MODE || "WAL").toUpperCase();
if (!JOURNAL_MODES.has(journalMode)) {
  throw new Error(`SQLITE_JOURNAL_MODE must be one of ${[...JOURNAL_MODES].join(", ")}`);
}

const db = new Database(dbPath);
db.pragma(`journal_mode = ${journalMode}`);
db.pragma("foreign_keys = ON");

migrate(db);

module.exports = db;
