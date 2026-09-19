const crypto = require("node:crypto");
const express = require("express");
const db = require("../db");

const router = express.Router();

const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_USER_URL = "https://api.github.com/user";

function upsertUser({ githubId, username, avatarUrl, accessToken }) {
  db.prepare(
    `INSERT INTO users (github_id, username, avatar_url, access_token)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(github_id) DO UPDATE SET
       username = excluded.username,
       avatar_url = excluded.avatar_url,
       access_token = excluded.access_token,
       updated_at = datetime('now')`
  ).run(githubId, username, avatarUrl, accessToken);

  return db.prepare("SELECT * FROM users WHERE github_id = ?").get(githubId);
}

router.get("/github", (req, res) => {
  const state = crypto.randomBytes(16).toString("hex");
  req.session.oauthState = state;

  // GitHub App user-authorization flow ignores `scope` — access is governed
  // by the permissions granted to the app's installation, not OAuth scopes.
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID,
    redirect_uri: `${process.env.BACKEND_BASE_URL}/auth/github/callback`,
    state,
  });

  res.redirect(`${GITHUB_AUTHORIZE_URL}?${params.toString()}`);
});

router.get("/github/callback", async (req, res) => {
  const { code, state } = req.query;

  if (!code || !state || state !== req.session.oauthState) {
    return res.status(400).json({ error: "invalid or missing OAuth state" });
  }
  req.session.oauthState = null;

  try {
    const tokenResponse = await fetch(GITHUB_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: `${process.env.BACKEND_BASE_URL}/auth/github/callback`,
      }),
    });
    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      return res.status(400).json({ error: "failed to obtain access token", details: tokenData });
    }

    const userResponse = await fetch(GITHUB_USER_URL, {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: "application/vnd.github+json",
      },
    });
    const githubUser = await userResponse.json();

    const user = upsertUser({
      githubId: githubUser.id,
      username: githubUser.login,
      avatarUrl: githubUser.avatar_url,
      accessToken: tokenData.access_token,
    });

    req.session.userId = user.id;
    res.redirect(process.env.APP_BASE_URL);
  } catch (err) {
    console.error("GitHub OAuth callback failed:", err);
    res.status(502).json({ error: "GitHub OAuth exchange failed" });
  }
});

router.get("/me", (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "not authenticated" });
  }
  const user = db
    .prepare("SELECT id, github_id, username, avatar_url, created_at FROM users WHERE id = ?")
    .get(req.session.userId);
  if (!user) {
    return res.status(401).json({ error: "not authenticated" });
  }
  res.json(user);
});

router.post("/logout", (req, res) => {
  req.session = null;
  res.status(204).end();
});

module.exports = router;
