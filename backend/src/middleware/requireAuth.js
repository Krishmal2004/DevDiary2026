const db = require("../db");

// Loads the signed-in user onto `req.user`, or rejects with 401.
function requireAuth(req, res, next) {
  const userId = req.session && req.session.userId;
  const user = userId ? db.prepare("SELECT * FROM users WHERE id = ?").get(userId) : null;
  if (!user) {
    return res.status(401).json({ error: "not authenticated" });
  }
  req.user = user;
  next();
}

module.exports = requireAuth;
