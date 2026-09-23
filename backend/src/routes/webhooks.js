const crypto = require("node:crypto");
const express = require("express");
const db = require("../db");

const router = express.Router();

function verifySignature(secret, rawBody, signatureHeader) {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const expected = Buffer.from(
    `sha256=${crypto.createHmac("sha256", secret).update(rawBody).digest("hex")}`
  );
  const actual = Buffer.from(signatureHeader);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

// POST /webhooks/github — GitHub App webhook receiver. Requires the raw body
// (mounted before express.json in app.js) to verify the HMAC signature.
router.post("/github", express.raw({ type: "application/json", limit: "5mb" }), (req, res) => {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    return res.status(503).json({ error: "webhooks are not configured" });
  }
  if (!Buffer.isBuffer(req.body) || !verifySignature(secret, req.body, req.get("X-Hub-Signature-256"))) {
    return res.status(401).json({ error: "invalid signature" });
  }

  let payload;
  try {
    payload = JSON.parse(req.body.toString("utf8"));
  } catch {
    return res.status(400).json({ error: "invalid JSON body" });
  }

  const event = req.get("X-GitHub-Event");
  const account = payload.installation?.account?.login || payload.sender?.login;

  switch (event) {
    case "github_app_authorization":
      // The user revoked the app's access: forget their tokens so nothing
      // keeps calling GitHub on their behalf. They can sign in again later.
      if (payload.action === "revoked" && payload.sender?.id) {
        db.prepare(
          `UPDATE users SET access_token = '', refresh_token = NULL, token_expires_at = NULL,
             refresh_token_expires_at = NULL, updated_at = datetime('now')
           WHERE github_id = ?`
        ).run(payload.sender.id);
        console.log(`GitHub access revoked by ${payload.sender.login}`);
      }
      break;
    case "installation":
    case "installation_repositories":
      console.log(`App ${event}.${payload.action} for ${account}`);
      break;
    case "marketplace_purchase":
      console.log(
        `Marketplace ${payload.action} by ${payload.marketplace_purchase?.account?.login}: ` +
          `${payload.marketplace_purchase?.plan?.name}`
      );
      break;
    default:
      break;
  }

  res.status(204).end();
});

module.exports = router;
