const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const { listApiTokens, deleteApiToken } = require("../services/apiTokens");

// The signed-in user's API tokens ("Connected editors" in the dashboard).
// Tokens themselves are never returned — only metadata.
const router = express.Router();
router.use(requireAuth);

router.get("/", (req, res) => {
  const currentId = req.apiToken ? req.apiToken.id : null;
  res.json(listApiTokens(req.user.id).map((t) => ({ ...t, current: t.id === currentId })));
});

// DELETE /auth/tokens/current — revokes the token making the request
// (the extension's Sign Out).
router.delete("/current", (req, res) => {
  if (!req.apiToken) {
    return res.status(400).json({ error: "this request was not made with an API token" });
  }
  deleteApiToken(req.user.id, req.apiToken.id);
  res.status(204).end();
});

router.delete("/:id", (req, res) => {
  if (!deleteApiToken(req.user.id, req.params.id)) {
    return res.status(404).json({ error: "not found" });
  }
  res.status(204).end();
});

module.exports = router;
