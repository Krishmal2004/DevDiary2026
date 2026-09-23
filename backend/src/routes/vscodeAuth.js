const crypto = require("node:crypto");
const express = require("express");
const db = require("../db");
const { createAuthCode, redeemAuthCode, createApiToken } = require("../services/apiTokens");
const { publicUser } = require("../users");

// Sign-in for the VS Code extension: an authorization-code flow with PKCE.
// The extension opens /auth/vscode/start in the browser, the user signs in
// with GitHub (if needed) and confirms, and the browser hands a one-time
// code back to the editor through its `vscode://` URI handler. The
// extension then exchanges the code (plus its PKCE verifier) for an API
// token at POST /auth/vscode/token. See docs/vscode-extension.md.

const router = express.Router();

const EDITOR_SCHEMES = new Set(["vscode:", "vscode-insiders:", "vscodium:"]);
const REQUEST_TTL_MS = 10 * 60 * 1000;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

function extensionId() {
  return (process.env.VSCODE_EXTENSION_ID || "krishmal2004.devdiary2026").toLowerCase();
}

// Only the extension's own URI handler may receive codes. Environments that
// can't open one (browser-based editors) omit redirect_uri and paste the
// code shown on the confirmation page instead.
function isAllowedRedirect(value) {
  try {
    const url = new URL(value);
    return EDITOR_SCHEMES.has(url.protocol) && url.host.toLowerCase() === extensionId() && url.pathname === "/auth";
  } catch {
    return false;
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function page(res, status, title, body, { head = "" } = {}) {
  res
    .status(status)
    .set("Cache-Control", "no-store")
    .type("html")
    .send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · DevDiary2026</title>
${head}
<style>
  :root { --bg: #f6f8fa; --card: #fff; --text: #1f2328; --muted: #59636e; --border: #d1d9e0;
          --primary: #1f883d; --primary-text: #fff; --code: #eff2f5; color-scheme: light dark; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #0d1117; --card: #151b23; --text: #f0f6fc; --muted: #9198a1; --border: #3d444d;
            --primary: #238636; --code: #262c36; }
  }
  body { margin: 0; background: var(--bg); color: var(--text);
         font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif; }
  main { max-width: 440px; margin: 64px auto; padding: 0 16px; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 24px; }
  h1 { font-size: 20px; margin: 0 0 12px; }
  p { margin: 0 0 12px; }
  .muted { color: var(--muted); }
  .account { display: flex; align-items: center; gap: 12px; margin: 16px 0; padding: 12px;
             border: 1px solid var(--border); border-radius: 8px; }
  .account img { width: 40px; height: 40px; border-radius: 50%; }
  .actions { display: flex; gap: 8px; margin-top: 20px; }
  .actions form { flex: 1; }
  button, .btn { width: 100%; padding: 8px 16px; font: inherit; font-weight: 600; border-radius: 6px; cursor: pointer;
                 border: 1px solid var(--border); background: var(--bg); color: var(--text); display: inline-block;
                 text-align: center; text-decoration: none; box-sizing: border-box; }
  .primary { background: var(--primary); border-color: transparent; color: var(--primary-text); }
  code.token { display: block; margin: 8px 0 0; padding: 10px; background: var(--code); border-radius: 6px;
               font: 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; word-break: break-all;
               user-select: all; }
  ul { padding-left: 20px; margin: 0 0 12px; }
</style>
</head>
<body><main><div class="card">${body}</div></main></body>
</html>`);
}

function errorPage(res, status, message) {
  page(
    res,
    status,
    "Can't connect VS Code",
    `<h1>Can't connect VS Code</h1>
     <p>${escapeHtml(message)}</p>
     <p class="muted">Run <strong>DevDiary: Sign In</strong> in VS Code to start again.</p>`
  );
}

function pendingRequest(req) {
  const pending = req.session.vscodeRequest;
  if (!pending || pending.expiresAt < Date.now()) return null;
  return pending;
}

// Small in-memory limiter for the token exchange, as defence in depth
// against code guessing (codes are 32 random bytes).
function rateLimit({ windowMs, max }) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip;
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      if (hits.size > 10_000) {
        for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
      }
      return next();
    }
    entry.count += 1;
    if (entry.count > max) {
      res.set("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ error: "too many requests, try again shortly" });
    }
    next();
  };
}

// GET /auth/vscode/start?state&code_challenge&code_challenge_method=S256
//   [&redirect_uri][&client_name][&reauth=1]
router.get("/start", (req, res) => {
  const { state, code_challenge, code_challenge_method, redirect_uri, client_name, reauth } = req.query;

  if (typeof state !== "string" || state.length < 16 || state.length > 128 || !BASE64URL.test(state)) {
    return errorPage(res, 400, "The sign-in request is missing a valid state.");
  }
  if (typeof code_challenge !== "string" || code_challenge.length !== 43 || !BASE64URL.test(code_challenge)) {
    return errorPage(res, 400, "The sign-in request is missing a valid code challenge.");
  }
  if (code_challenge_method !== "S256") {
    return errorPage(res, 400, "Only the S256 code challenge method is supported.");
  }
  if (redirect_uri !== undefined && !isAllowedRedirect(redirect_uri)) {
    return errorPage(res, 400, "This sign-in request came from an app that isn't the DevDiary extension.");
  }

  const clientName =
    typeof client_name === "string" && client_name.trim() ? client_name.trim().slice(0, 100) : "VS Code";

  req.session.vscodeRequest = {
    state,
    codeChallenge: code_challenge,
    redirectUri: redirect_uri || null,
    clientName,
    nonce: crypto.randomBytes(16).toString("hex"),
    expiresAt: Date.now() + REQUEST_TTL_MS,
  };

  // Already signed in to the dashboard: skip GitHub, unless the extension
  // asked to refresh the GitHub authorization.
  const signedIn = req.session.userId && db.prepare("SELECT 1 FROM users WHERE id = ?").get(req.session.userId);
  if (signedIn && reauth !== "1") {
    return res.redirect(`${req.baseUrl}/authorize`);
  }
  res.redirect("/auth/github");
});

// GET /auth/vscode/authorize — the confirmation page.
router.get("/authorize", (req, res) => {
  const pending = pendingRequest(req);
  if (!pending) {
    return errorPage(res, 400, "This sign-in request has expired or was already used.");
  }
  const user = req.session.userId && db.prepare("SELECT * FROM users WHERE id = ?").get(req.session.userId);
  if (!user) {
    return res.redirect("/auth/github");
  }

  const avatar = user.avatar_url ? `<img src="${escapeHtml(user.avatar_url)}" alt="">` : "";
  page(
    res,
    200,
    "Connect VS Code",
    `<h1>Connect ${escapeHtml(pending.clientName)} to DevDiary?</h1>
     <div class="account">${avatar}<div><strong>${escapeHtml(user.username)}</strong>
       <div class="muted">Signed in with GitHub</div></div></div>
     <p>The DevDiary extension will be able to:</p>
     <ul>
       <li>Read and write your diary entries</li>
       <li>Read, create, edit and delete your todos</li>
       <li>See your GitHub activity, as the dashboard does</li>
     </ul>
     <p class="muted">You can disconnect it at any time from Settings → Connected editors.
       Only continue if you just started signing in from VS Code.</p>
     <div class="actions">
       <form method="post" action="${req.baseUrl}/authorize">
         <input type="hidden" name="nonce" value="${escapeHtml(pending.nonce)}">
         <input type="hidden" name="decision" value="deny">
         <button type="submit">Cancel</button>
       </form>
       <form method="post" action="${req.baseUrl}/authorize">
         <input type="hidden" name="nonce" value="${escapeHtml(pending.nonce)}">
         <input type="hidden" name="decision" value="allow">
         <button type="submit" class="primary">Allow</button>
       </form>
     </div>`
  );
});

// POST /auth/vscode/authorize — Allow or Cancel from the confirmation page.
router.post("/authorize", express.urlencoded({ extended: false, limit: "4kb" }), (req, res) => {
  const pending = pendingRequest(req);
  const user = req.session.userId && db.prepare("SELECT * FROM users WHERE id = ?").get(req.session.userId);
  const nonce = req.body && req.body.nonce;
  if (!pending || !user || typeof nonce !== "string" || nonce !== pending.nonce) {
    return errorPage(res, 400, "This sign-in request has expired or was already used.");
  }
  // One decision per request.
  req.session.vscodeRequest = null;

  if (req.body.decision !== "allow") {
    if (pending.redirectUri) {
      const url = new URL(pending.redirectUri);
      url.searchParams.set("error", "access_denied");
      url.searchParams.set("state", pending.state);
      return page(res, 200, "Cancelled", `<h1>Cancelled</h1><p>VS Code was not connected.</p>`, {
        head: `<meta http-equiv="refresh" content="0;url=${escapeHtml(url.toString())}">`,
      });
    }
    return page(res, 200, "Cancelled", `<h1>Cancelled</h1><p>VS Code was not connected. You can close this tab.</p>`);
  }

  const code = createAuthCode({ userId: user.id, codeChallenge: pending.codeChallenge, clientName: pending.clientName });
  const codeBlock = `<p class="muted" style="margin-top:16px">If VS Code didn't pick this up, choose
       <strong>Paste code</strong> in VS Code and paste this one-time code. It expires in 5 minutes.</p>
     <code class="token">${escapeHtml(code)}</code>`;

  if (!pending.redirectUri) {
    return page(
      res,
      200,
      "Copy your code",
      `<h1>Almost done</h1><p>Paste this one-time code into VS Code to finish signing in.</p>
       <code class="token">${escapeHtml(code)}</code>
       <p class="muted" style="margin-top:12px">It expires in 5 minutes.</p>`
    );
  }

  const url = new URL(pending.redirectUri);
  url.searchParams.set("code", code);
  url.searchParams.set("state", pending.state);
  const href = escapeHtml(url.toString());
  page(
    res,
    200,
    "Return to VS Code",
    `<h1>Return to VS Code</h1>
     <p>Your browser will ask to open VS Code. Allow it to finish signing in.</p>
     <div class="actions"><a class="btn primary" href="${href}">Open VS Code</a></div>
     ${codeBlock}`,
    { head: `<meta http-equiv="refresh" content="0;url=${href}">` }
  );
});

// POST /auth/vscode/token — { code, code_verifier } → { token, user }
router.post("/token", rateLimit({ windowMs: 60_000, max: 20 }), (req, res) => {
  const { code, code_verifier } = req.body || {};
  const redeemed = redeemAuthCode(code, code_verifier);
  if (!redeemed) {
    return res.status(400).json({ error: "the code is invalid, expired or already used" });
  }
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(redeemed.userId);
  if (!user) {
    return res.status(400).json({ error: "the code is invalid, expired or already used" });
  }
  const token = createApiToken(user.id, redeemed.clientName);
  res.set("Cache-Control", "no-store").json({ token, user: publicUser(user) });
});

module.exports = router;
