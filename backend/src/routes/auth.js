const crypto = require("node:crypto");
const express = require("express");
const db = require("../db");
const requireAuth = require("../middleware/requireAuth");
const { requestToken } = require("../services/github");
const { isValidEmail, isValidTimezone } = require("../validation");

const router = express.Router();

const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const GITHUB_USER_URL = "https://api.github.com/user";

function callbackUrl() {
  return `${process.env.BACKEND_BASE_URL}/auth/github/callback`;
}

function upsertUser({ githubId, username, avatarUrl, email, tokens }) {
  db.prepare(
    `INSERT INTO users (github_id, username, avatar_url, email, access_token, refresh_token,
                        token_expires_at, refresh_token_expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(github_id) DO UPDATE SET
       username = excluded.username,
       avatar_url = excluded.avatar_url,
       email = COALESCE(users.email, excluded.email),
       access_token = excluded.access_token,
       refresh_token = excluded.refresh_token,
       token_expires_at = excluded.token_expires_at,
       refresh_token_expires_at = excluded.refresh_token_expires_at,
       updated_at = datetime('now')`
  ).run(
    githubId,
    username,
    avatarUrl,
    email,
    tokens.accessToken,
    tokens.refreshToken,
    tokens.tokenExpiresAt,
    tokens.refreshTokenExpiresAt
  );

  return db.prepare("SELECT * FROM users WHERE github_id = ?").get(githubId);
}

function publicUser(user) {
  return {
    id: user.id,
    github_id: user.github_id,
    username: user.username,
    avatar_url: user.avatar_url,
    email: user.email,
    reminders_enabled: !!user.reminders_enabled,
    timezone: user.timezone,
    created_at: user.created_at,
  };
}

router.get("/github", (req, res) => {
  const state = crypto.randomBytes(16).toString("hex");
  req.session.oauthState = state;

  // GitHub App user-authorization flow ignores `scope` — access is governed
  // by the permissions granted to the app's installation, not OAuth scopes.
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID,
    redirect_uri: callbackUrl(),
    state,
  });

  res.redirect(`${GITHUB_AUTHORIZE_URL}?${params.toString()}`);
});

router.get("/github/callback", async (req, res) => {
  const { code, state } = req.query;

  // Installing the app from GitHub (or changing which repos it can see)
  // lands here without our `state`, so there's nothing to verify the code
  // against. Start a normal sign-in instead, which returns to the dashboard.
  if (req.query.setup_action && !state) {
    return res.redirect(req.session.userId ? process.env.APP_BASE_URL : `${req.baseUrl}/github`);
  }

  if (!code || !state || state !== req.session.oauthState) {
    return res.status(400).json({ error: "invalid or missing OAuth state" });
  }
  req.session.oauthState = null;

  try {
    const tokens = await requestToken({ code, redirect_uri: callbackUrl() });

    const userResponse = await fetch(GITHUB_USER_URL, {
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        Accept: "application/vnd.github+json",
      },
    });
    if (!userResponse.ok) {
      throw new Error(`GitHub /user responded ${userResponse.status}`);
    }
    const githubUser = await userResponse.json();

    const user = upsertUser({
      githubId: githubUser.id,
      username: githubUser.login,
      avatarUrl: githubUser.avatar_url,
      // Only the public profile email is visible without the "Email
      // addresses" permission; users can set/override it in settings.
      email: githubUser.email || null,
      tokens,
    });

    req.session.userId = user.id;
    res.redirect(process.env.APP_BASE_URL);
  } catch (err) {
    console.error("GitHub OAuth callback failed:", err);
    res.status(502).json({ error: "GitHub OAuth exchange failed" });
  }
});

router.get("/me", requireAuth, (req, res) => {
  res.json(publicUser(req.user));
});

router.patch("/me", requireAuth, (req, res) => {
  const { email, reminders_enabled, timezone } = req.body;
  const updates = {};

  if (email !== undefined) {
    if (email !== null && email !== "" && !isValidEmail(email)) {
      return res.status(400).json({ error: "email is not a valid address" });
    }
    updates.email = email || null;
  }
  if (reminders_enabled !== undefined) {
    updates.reminders_enabled = reminders_enabled ? 1 : 0;
  }
  if (timezone !== undefined) {
    if (!isValidTimezone(timezone)) {
      return res.status(400).json({ error: "timezone must be an IANA name like Europe/London" });
    }
    updates.timezone = timezone;
  }

  const columns = Object.keys(updates);
  if (columns.length > 0) {
    db.prepare(
      `UPDATE users SET ${columns.map((c) => `${c} = ?`).join(", ")}, updated_at = datetime('now')
       WHERE id = ?`
    ).run(...columns.map((c) => updates[c]), req.user.id);
  }

  res.json(publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id)));
});

router.post("/logout", (req, res) => {
  req.session = null;
  res.status(204).end();
});

module.exports = router;
