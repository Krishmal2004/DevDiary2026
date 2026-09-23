const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const {
  fetchActivity,
  activityToMarkdown,
  listRepositories,
  fetchRepository,
  fetchContributionCalendar,
  GitHubAuthError,
} = require("../services/github");
const { isValidDateString } = require("../validation");

const router = express.Router();
router.use(requireAuth);

function handleGitHubError(res, err, what) {
  if (err instanceof GitHubAuthError) {
    return res.status(401).json({ error: err.message, reauth: true });
  }
  console.error(`Fetching ${what} from GitHub failed:`, err);
  res.status(502).json({ error: `Could not fetch ${what} from GitHub` });
}

// GET /api/github/contributions — last year's contribution graph.
router.get("/contributions", async (req, res) => {
  try {
    res.json(await fetchContributionCalendar(req.user));
  } catch (err) {
    handleGitHubError(res, err, "contributions");
  }
});

// GET /api/github/repos — every repository the app can see for this user.
router.get("/repos", async (req, res) => {
  try {
    res.json(await listRepositories(req.user));
  } catch (err) {
    handleGitHubError(res, err, "repositories");
  }
});

// GET /api/github/repos/:owner/:name — recent commits, open PRs and issues.
router.get("/repos/:owner/:name", async (req, res) => {
  const { owner, name } = req.params;
  if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(name)) {
    return res.status(400).json({ error: "invalid repository name" });
  }
  try {
    const repo = await fetchRepository(req.user, owner, name);
    if (!repo) return res.status(404).json({ error: "repository not found or not accessible" });
    res.json(repo);
  } catch (err) {
    handleGitHubError(res, err, "the repository");
  }
});

// GET /api/github/activity?date=YYYY-MM-DD&tzOffset=<minutes>
//
// Returns the user's commits/PRs/reviews for one local calendar day plus a
// markdown draft for the diary. `tzOffset` is the browser's
// Date#getTimezoneOffset() (minutes behind UTC), so "the day" matches the
// user's own midnight-to-midnight rather than UTC's.
router.get("/activity", async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const tzOffset = Number(req.query.tzOffset ?? 0);
  if (!isValidDateString(date)) {
    return res.status(400).json({ error: "date must be YYYY-MM-DD" });
  }
  if (!Number.isInteger(tzOffset) || Math.abs(tzOffset) > 14 * 60) {
    return res.status(400).json({ error: "tzOffset must be minutes between -840 and 840" });
  }

  const start = Date.parse(`${date}T00:00:00Z`) + tzOffset * 60 * 1000;
  const from = new Date(start).toISOString();
  const to = new Date(start + 24 * 60 * 60 * 1000 - 1000).toISOString();

  try {
    const activity = await fetchActivity(req.user, { from, to });
    res.json({ date, ...activity, markdown: activityToMarkdown(activity, date) });
  } catch (err) {
    handleGitHubError(res, err, "activity");
  }
});

module.exports = router;
