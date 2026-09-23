const crypto = require("node:crypto");
const db = require("../db");

// API tokens let editor clients (the VS Code extension) call the API with
// `Authorization: Bearer ddv_…` instead of a session cookie. They're minted
// by exchanging a one-time code from the browser sign-in flow (with PKCE).
// Only SHA-256 hashes of tokens and codes are stored.

const TOKEN_PREFIX = "ddv_";
const CODE_TTL_MS = 5 * 60 * 1000;

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function randomString() {
  return crypto.randomBytes(32).toString("base64url");
}

// PKCE S256: base64url(SHA-256(verifier)).
function pkceChallenge(verifier) {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

function timingSafeEqualStrings(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function createAuthCode({ userId, codeChallenge, clientName, now = Date.now() }) {
  // Old codes are only useful for a few minutes, so clear them out as new
  // ones are made rather than on a schedule.
  db.prepare("DELETE FROM auth_codes WHERE expires_at < ?").run(new Date(now).toISOString());

  const code = randomString();
  db.prepare(
    `INSERT INTO auth_codes (code_hash, user_id, code_challenge, client_name, expires_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(sha256(code), userId, codeChallenge, clientName, new Date(now + CODE_TTL_MS).toISOString());
  return code;
}

// Returns { userId, clientName } for a valid, unused, unexpired code whose
// challenge matches the verifier, and marks it used. Otherwise null.
function redeemAuthCode(code, codeVerifier, now = Date.now()) {
  if (typeof code !== "string" || typeof codeVerifier !== "string") return null;
  const row = db.prepare("SELECT * FROM auth_codes WHERE code_hash = ?").get(sha256(code));
  if (!row || row.used_at || row.expires_at < new Date(now).toISOString()) return null;

  // Mark the code used before checking the verifier, so a wrong guess burns
  // it instead of allowing retries.
  const claimed = db
    .prepare("UPDATE auth_codes SET used_at = ? WHERE code_hash = ? AND used_at IS NULL")
    .run(new Date(now).toISOString(), row.code_hash);
  if (claimed.changes === 0) return null;
  if (!timingSafeEqualStrings(pkceChallenge(codeVerifier), row.code_challenge)) return null;

  return { userId: row.user_id, clientName: row.client_name };
}

function createApiToken(userId, name) {
  const token = TOKEN_PREFIX + randomString();
  db.prepare("INSERT INTO api_tokens (user_id, name, token_hash) VALUES (?, ?, ?)").run(userId, name, sha256(token));
  return token;
}

// Returns { token, user } for a valid token, or null.
function findApiToken(token) {
  if (typeof token !== "string" || !token.startsWith(TOKEN_PREFIX)) return null;
  const row = db.prepare("SELECT * FROM api_tokens WHERE token_hash = ?").get(sha256(token));
  if (!row) return null;
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(row.user_id);
  if (!user) return null;

  // Record use for the "Connected editors" list, at most once a minute.
  db.prepare(
    `UPDATE api_tokens SET last_used_at = datetime('now')
     WHERE id = ? AND (last_used_at IS NULL OR last_used_at < datetime('now', '-1 minute'))`
  ).run(row.id);

  return { token: row, user };
}

function listApiTokens(userId) {
  return db
    .prepare("SELECT id, name, created_at, last_used_at FROM api_tokens WHERE user_id = ? ORDER BY id DESC")
    .all(userId);
}

function deleteApiToken(userId, id) {
  return db.prepare("DELETE FROM api_tokens WHERE id = ? AND user_id = ?").run(id, userId).changes > 0;
}

module.exports = {
  TOKEN_PREFIX,
  pkceChallenge,
  createAuthCode,
  redeemAuthCode,
  createApiToken,
  findApiToken,
  listApiTokens,
  deleteApiToken,
};
