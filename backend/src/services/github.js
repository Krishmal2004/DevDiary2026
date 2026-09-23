const db = require("../db");

const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_API_URL = "https://api.github.com";

class GitHubAuthError extends Error {}

function isoFromNow(seconds) {
  return seconds ? new Date(Date.now() + seconds * 1000).toISOString() : null;
}

// Exchanges an OAuth `code` or a `refresh_token` for user access tokens.
async function requestToken(params) {
  const response = await fetch(GITHUB_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      ...params,
    }),
  });
  const data = await response.json();
  if (!data.access_token) {
    throw new GitHubAuthError(data.error_description || data.error || "token request failed");
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || null,
    // GitHub App user tokens expire after 8h (with a 6-month refresh token)
    // unless token expiration is disabled in the app settings.
    tokenExpiresAt: isoFromNow(data.expires_in),
    refreshTokenExpiresAt: isoFromNow(data.refresh_token_expires_in),
  };
}

// Returns a usable access token for `user`, refreshing it first if it has
// expired (or is about to).
async function getAccessToken(user) {
  // Cleared when the user revokes the app on GitHub (see routes/webhooks.js).
  if (!user.access_token) {
    throw new GitHubAuthError("GitHub access was revoked — please sign in again");
  }
  const expiresAt = user.token_expires_at ? Date.parse(user.token_expires_at) : null;
  if (!expiresAt || expiresAt - Date.now() > 60 * 1000) {
    return user.access_token;
  }
  if (!user.refresh_token) {
    throw new GitHubAuthError("GitHub token expired — please sign in again");
  }

  const tokens = await requestToken({
    grant_type: "refresh_token",
    refresh_token: user.refresh_token,
  });
  db.prepare(
    `UPDATE users SET access_token = ?, refresh_token = ?, token_expires_at = ?,
       refresh_token_expires_at = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    tokens.accessToken,
    tokens.refreshToken,
    tokens.tokenExpiresAt,
    tokens.refreshTokenExpiresAt,
    user.id
  );
  return tokens.accessToken;
}

async function githubGraphQL(token, query, variables = {}) {
  const response = await fetch(`${GITHUB_API_URL}/graphql`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (response.status === 401) {
    throw new GitHubAuthError("GitHub rejected the access token — please sign in again");
  }
  const body = await response.json();
  if (!response.ok || (!body.data && body.errors)) {
    const message = body.errors?.map((e) => e.message).join("; ") || body.message;
    throw new Error(`GitHub GraphQL request failed: ${message || response.status}`);
  }
  return body.data;
}

async function githubRest(token, path) {
  const response = await fetch(`${GITHUB_API_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (response.status === 401) {
    throw new GitHubAuthError("GitHub rejected the access token — please sign in again");
  }
  if (!response.ok) {
    throw new Error(`GitHub API ${path} responded ${response.status}`);
  }
  return response.json();
}

// Fetches every page of a list endpoint that wraps results in `key`.
async function githubRestAll(token, path, key) {
  const results = [];
  for (let page = 1; ; page++) {
    const separator = path.includes("?") ? "&" : "?";
    const body = await githubRest(token, `${path}${separator}per_page=100&page=${page}`);
    results.push(...body[key]);
    if (body[key].length < 100 || results.length >= body.total_count) return results;
  }
}

function installUrl() {
  const slug = process.env.GITHUB_APP_SLUG || "devdiary2026";
  return `https://github.com/apps/${slug}/installations/new`;
}

// Every repository the user can reach through the app's installations. A
// GitHub App user token only sees repos the app is installed on, so this is
// "all repos" once the app is installed with "All repositories" selected.
async function listRepositories(user) {
  const token = await getAccessToken(user);
  const { installations } = await githubRest(token, "/user/installations?per_page=100");

  const repos = [];
  for (const installation of installations) {
    const list = await githubRestAll(token, `/user/installations/${installation.id}/repositories`, "repositories");
    for (const r of list) {
      repos.push({
        id: r.id,
        fullName: r.full_name,
        owner: r.owner.login,
        name: r.name,
        url: r.html_url,
        description: r.description,
        private: r.private,
        fork: r.fork,
        archived: r.archived,
        language: r.language,
        stars: r.stargazers_count,
        forks: r.forks_count,
        openIssues: r.open_issues_count,
        defaultBranch: r.default_branch,
        pushedAt: r.pushed_at,
        installation: installation.account.login,
      });
    }
  }

  // The same repo can appear under more than one installation.
  const unique = [...new Map(repos.map((r) => [r.id, r])).values()];
  unique.sort((a, b) => (b.pushedAt || "").localeCompare(a.pushedAt || ""));

  return {
    installUrl: installUrl(),
    installations: installations.map((i) => ({
      id: i.id,
      account: i.account.login,
      repositorySelection: i.repository_selection,
      settingsUrl: i.html_url,
    })),
    repositories: unique,
  };
}

const REPOSITORY_QUERY = `
  query ($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      nameWithOwner
      url
      description
      isPrivate
      stargazerCount
      forkCount
      primaryLanguage { name }
      defaultBranchRef {
        name
        target {
          ... on Commit {
            history(first: 20) {
              totalCount
              nodes { oid messageHeadline url committedDate author { name user { login } } }
            }
          }
        }
      }
      pullRequests(states: OPEN, first: 20, orderBy: { field: UPDATED_AT, direction: DESC }) {
        totalCount
        nodes { number title url isDraft updatedAt author { login } }
      }
    }
  }
`;

// Issues are fetched separately: they need the app's "Issues" permission, and
// a permission error there shouldn't hide the rest of the repository.
const REPOSITORY_ISSUES_QUERY = `
  query ($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      issues(states: OPEN, first: 20, orderBy: { field: UPDATED_AT, direction: DESC }) {
        totalCount
        nodes { number title url updatedAt author { login } labels(first: 5) { nodes { name color } } }
      }
    }
  }
`;

async function fetchRepository(user, owner, name) {
  const token = await getAccessToken(user);
  const data = await githubGraphQL(token, REPOSITORY_QUERY, { owner, name });
  const repo = data.repository;
  if (!repo) return null;

  let issues = null;
  let issuesError = null;
  try {
    const issueData = await githubGraphQL(token, REPOSITORY_ISSUES_QUERY, { owner, name });
    const connection = issueData.repository?.issues;
    if (connection) {
      issues = {
        totalCount: connection.totalCount,
        items: connection.nodes.map((i) => ({
          number: i.number,
          title: i.title,
          url: i.url,
          updatedAt: i.updatedAt,
          author: i.author?.login ?? null,
          labels: i.labels.nodes,
        })),
      };
    } else {
      issuesError = "Issues aren't readable — grant the app the Issues (read-only) permission.";
    }
  } catch (err) {
    if (err instanceof GitHubAuthError) throw err;
    issuesError = "Issues aren't readable — grant the app the Issues (read-only) permission.";
  }

  const history = repo.defaultBranchRef?.target?.history;
  return {
    fullName: repo.nameWithOwner,
    url: repo.url,
    description: repo.description,
    private: repo.isPrivate,
    stars: repo.stargazerCount,
    forks: repo.forkCount,
    language: repo.primaryLanguage?.name ?? null,
    defaultBranch: repo.defaultBranchRef?.name ?? null,
    commits: {
      totalCount: history?.totalCount ?? 0,
      items: (history?.nodes ?? []).map((c) => ({
        sha: c.oid,
        message: c.messageHeadline,
        url: c.url,
        committedAt: c.committedDate,
        author: c.author?.user?.login ?? c.author?.name ?? null,
      })),
    },
    pullRequests: {
      totalCount: repo.pullRequests.totalCount,
      items: repo.pullRequests.nodes.map((p) => ({
        number: p.number,
        title: p.title,
        url: p.url,
        draft: p.isDraft,
        updatedAt: p.updatedAt,
        author: p.author?.login ?? null,
      })),
    },
    issues,
    issuesError,
  };
}

const CONTRIBUTION_CALENDAR_QUERY = `
  query {
    viewer {
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays { date weekday contributionCount contributionLevel }
          }
        }
      }
    }
  }
`;

const CONTRIBUTION_LEVELS = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
};

// The user's GitHub contribution graph for the last year, as GitHub shows it
// on their profile.
async function fetchContributionCalendar(user) {
  const token = await getAccessToken(user);
  const data = await githubGraphQL(token, CONTRIBUTION_CALENDAR_QUERY);
  const calendar = data.viewer.contributionsCollection.contributionCalendar;
  return {
    totalContributions: calendar.totalContributions,
    weeks: calendar.weeks.map((week) =>
      week.contributionDays.map((day) => ({
        date: day.date,
        weekday: day.weekday,
        count: day.contributionCount,
        level: CONTRIBUTION_LEVELS[day.contributionLevel] ?? 0,
      }))
    ),
  };
}

const ISSUE_CONTRIBUTIONS_QUERY = `
  query ($from: DateTime!, $to: DateTime!) {
    viewer {
      contributionsCollection(from: $from, to: $to) {
        issueContributions(first: 50) {
          nodes { occurredAt issue { title url number state repository { nameWithOwner } } }
        }
      }
    }
  }
`;

const CONTRIBUTIONS_QUERY = `
  query ($from: DateTime!, $to: DateTime!) {
    viewer {
      id
      login
      contributionsCollection(from: $from, to: $to) {
        commitContributionsByRepository(maxRepositories: 25) {
          repository { nameWithOwner url }
          contributions { totalCount }
        }
        pullRequestContributions(first: 50) {
          nodes {
            occurredAt
            pullRequest { title url number state repository { nameWithOwner } }
          }
        }
        pullRequestReviewContributions(first: 50) {
          nodes {
            occurredAt
            pullRequest { title url number repository { nameWithOwner } }
          }
        }
      }
    }
  }
`;

// Builds one query that fetches the viewer's commits on each repo's default
// branch, aliased r0, r1, … (GraphQL has no way to parameterise a list of
// repositories, so the names are inlined as JSON-escaped string literals).
function buildCommitHistoryQuery(repoNames) {
  const fields = repoNames.map((nameWithOwner, i) => {
    const [owner, name] = nameWithOwner.split("/");
    return `
      r${i}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) {
        defaultBranchRef {
          target {
            ... on Commit {
              history(first: 50, since: $from, until: $to, author: { id: $authorId }) {
                nodes { oid messageHeadline url committedDate }
              }
            }
          }
        }
      }`;
  });
  return `query ($from: GitTimestamp!, $to: GitTimestamp!, $authorId: ID!) {${fields.join("")}\n}`;
}

// Pulls the user's commits, opened PRs and PR reviews between `from` and `to`
// (ISO timestamps) across every repository the GitHub App can see.
async function fetchActivity(user, { from, to }) {
  const token = await getAccessToken(user);
  const { viewer } = await githubGraphQL(token, CONTRIBUTIONS_QUERY, { from, to });
  const collection = viewer.contributionsCollection;

  const commitRepos = collection.commitContributionsByRepository.map((c) => ({
    repo: c.repository.nameWithOwner,
    url: c.repository.url,
    count: c.contributions.totalCount,
    commits: [],
  }));

  if (commitRepos.length > 0) {
    try {
      const history = await githubGraphQL(
        token,
        buildCommitHistoryQuery(commitRepos.map((r) => r.repo)),
        { from, to, authorId: viewer.id }
      );
      commitRepos.forEach((repo, i) => {
        const nodes = history?.[`r${i}`]?.defaultBranchRef?.target?.history?.nodes || [];
        repo.commits = nodes.map((n) => ({
          sha: n.oid,
          message: n.messageHeadline,
          url: n.url,
          committedAt: n.committedDate,
        }));
      });
    } catch (err) {
      // Commit messages are a nice-to-have; per-repo counts still render.
      console.warn("Could not fetch commit history:", err.message);
    }
  }

  const pullRequests = collection.pullRequestContributions.nodes
    .filter((n) => n.pullRequest)
    .map((n) => ({
      repo: n.pullRequest.repository.nameWithOwner,
      number: n.pullRequest.number,
      title: n.pullRequest.title,
      url: n.pullRequest.url,
      state: n.pullRequest.state,
      occurredAt: n.occurredAt,
    }));

  const reviews = collection.pullRequestReviewContributions.nodes
    .filter((n) => n.pullRequest)
    .map((n) => ({
      repo: n.pullRequest.repository.nameWithOwner,
      number: n.pullRequest.number,
      title: n.pullRequest.title,
      url: n.pullRequest.url,
      occurredAt: n.occurredAt,
    }));

  let issues = [];
  try {
    const issueData = await githubGraphQL(token, ISSUE_CONTRIBUTIONS_QUERY, { from, to });
    issues = issueData.viewer.contributionsCollection.issueContributions.nodes
      .filter((n) => n.issue)
      .map((n) => ({
        repo: n.issue.repository.nameWithOwner,
        number: n.issue.number,
        title: n.issue.title,
        url: n.issue.url,
        state: n.issue.state,
        occurredAt: n.occurredAt,
      }));
  } catch (err) {
    if (err instanceof GitHubAuthError) throw err;
    console.warn("Could not fetch issue contributions:", err.message);
  }

  return {
    login: viewer.login,
    from,
    to,
    commitRepos,
    pullRequests,
    reviews,
    issues,
    totals: {
      commits: commitRepos.reduce((sum, r) => sum + r.count, 0),
      pullRequests: pullRequests.length,
      reviews: reviews.length,
      issues: issues.length,
    },
  };
}

// Renders activity as a markdown diary draft.
function activityToMarkdown(activity, dateLabel) {
  const lines = [`## What I worked on — ${dateLabel}`, ""];

  if (activity.pullRequests.length > 0) {
    lines.push("### Pull requests");
    for (const pr of activity.pullRequests) {
      lines.push(`- Opened [${pr.title}](${pr.url}) (${pr.repo}#${pr.number}) — ${pr.state.toLowerCase()}`);
    }
    lines.push("");
  }

  if (activity.reviews.length > 0) {
    lines.push("### Reviews");
    for (const review of activity.reviews) {
      lines.push(`- Reviewed [${review.title}](${review.url}) (${review.repo}#${review.number})`);
    }
    lines.push("");
  }

  if (activity.issues.length > 0) {
    lines.push("### Issues");
    for (const issue of activity.issues) {
      lines.push(`- Opened [${issue.title}](${issue.url}) (${issue.repo}#${issue.number}) — ${issue.state.toLowerCase()}`);
    }
    lines.push("");
  }

  if (activity.commitRepos.length > 0) {
    lines.push("### Commits");
    for (const repo of activity.commitRepos) {
      lines.push(`**${repo.repo}** — ${repo.count} commit${repo.count === 1 ? "" : "s"}`);
      for (const commit of repo.commits) {
        lines.push(`- [\`${commit.sha.slice(0, 7)}\`](${commit.url}) ${commit.message}`);
      }
      lines.push("");
    }
  }

  if (Object.values(activity.totals).every((n) => n === 0)) {
    lines.push("_No GitHub activity recorded for this day._", "");
  }

  lines.push("### Notes", "");
  return lines.join("\n");
}

module.exports = {
  GitHubAuthError,
  requestToken,
  getAccessToken,
  fetchActivity,
  activityToMarkdown,
  buildCommitHistoryQuery,
  listRepositories,
  fetchRepository,
  fetchContributionCalendar,
  installUrl,
};
