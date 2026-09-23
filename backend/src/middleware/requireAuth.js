const db = require("../db");
const { findApiToken } = require("../services/apiTokens");

// Loads the signed-in user onto `req.user`, or rejects with 401. Accepts an
// API token (`Authorization: Bearer ddv_…`, used by the VS Code extension)
// or the dashboard's session cookie. A request that sends a bearer token is
// judged on that token alone and never falls back to the cookie.
function requireAuth(req, res, next) {
  const header = req.get("Authorization");
  if (header) {
    const match = /^Bearer\s+(\S+)$/i.exec(header);
    const found = match ? findApiToken(match[1]) : null;
    if (!found) {
      return res.status(401).json({ error: "invalid or revoked API token" });
    }
    req.user = found.user;
    req.apiToken = found.token;
    return next();
  }

  const userId = req.session && req.session.userId;
  const user = userId ? db.prepare("SELECT * FROM users WHERE id = ?").get(userId) : null;
  if (!user) {
    return res.status(401).json({ error: "not authenticated" });
  }
  req.user = user;
  next();
}

module.exports = requireAuth;
