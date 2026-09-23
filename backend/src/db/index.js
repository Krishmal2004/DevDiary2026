const path = require("node:path");
const fs = require("node:fs");
const Database = require("better-sqlite3");
const { migrate } = require("./migrations");

const dbPath = process.env.DATABASE_PATH || "./data/devdiary.sqlite";
if (dbPath !== ":memory:") {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

migrate(db);

module.exports = db;
