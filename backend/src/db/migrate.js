// CLI entry point for `npm run migrate`. Opening the database applies any
// pending migrations (the server also does this on startup).
require("dotenv").config();
const { latestVersion } = require("./migrations");

const db = require("./index");
const version = db.pragma("user_version", { simple: true });
console.log(`Database schema is at version ${version} (latest: ${latestVersion}).`);
db.close();
