// End-to-end API tests: boots the real Express app against an in-memory
// database and stubs only the outbound calls to GitHub and the email API.
process.env.DATABASE_PATH = ":memory:";
process.env.SESSION_SECRET = "test-secret";
process.env.APP_BASE_URL = "http://localhost:5173";
process.env.BACKEND_BASE_URL = "http://localhost:4000";
process.env.GITHUB_CLIENT_ID = "test-client-id";
process.env.GITHUB_CLIENT_SECRET = "test-client-secret";
delete process.env.EMAIL_API_KEY;

const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const Keygrip = require("keygrip");

const db = require("../src/db");
const { createApp } = require("../src/app");
const { runReminderCheck } = require("../src/services/reminders");

const realFetch = globalThis.fetch;
let githubHandler = null;
let server;
let baseUrl;
let alice;
let bob;

function sessionCookie(userId) {
  const name = "devdiary_session";
  const value = Buffer.from(JSON.stringify({ userId })).toString("base64");
  const sig = new Keygrip([process.env.SESSION_SECRET]).sign(`${name}=${value}`);
  return `${name}=${value}; ${name}.sig=${sig}`;
}

async function api(path, { user, token, method = "GET", body } = {}) {
  const response = await realFetch(`${baseUrl}${path}`, {
    method,
    redirect: "manual",
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(user ? { Cookie: sessionCookie(user.id) } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const isJson = (response.headers.get("content-type") || "").includes("application/json");
  const json = isJson ? await response.json() : null;
  return { status: response.status, headers: response.headers, body: json };
}

function createUser(githubId, username, extra = {}) {
  const result = db
    .prepare("INSERT INTO users (github_id, username, access_token, email) VALUES (?, ?, ?, ?)")
    .run(githubId, username, `token-${username}`, extra.email ?? null);
  return db.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid);
}

before(async () => {
  // Route GitHub and email-provider calls to the per-test stub.
  globalThis.fetch = async (url, options) => {
    const href = String(url);
    if (href.startsWith("https://api.github.com") || href.startsWith("https://github.com")) {
      return githubHandler(href, options);
    }
    return realFetch(url, options);
  };

  alice = createUser(1, "alice", { email: "alice@example.com" });
  bob = createUser(2, "bob");

  await new Promise((resolve) => {
    server = createApp().listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

after(() => {
  globalThis.fetch = realFetch;
  server.close();
});

beforeEach(() => {
  db.exec("DELETE FROM todos; DELETE FROM diary_entries;");
  githubHandler = () => {
    throw new Error("unexpected GitHub call");
  };
});

test("health check is public", async () => {
  const res = await api("/health");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: "ok" });
});

test("API routes require authentication", async () => {
  for (const path of ["/api/todos", "/api/diary", "/api/github/activity", "/auth/me"]) {
    const res = await api(path);
    assert.equal(res.status, 401, path);
  }
});

test("/auth/github redirects to GitHub with state", async () => {
  const res = await api("/auth/github");
  assert.equal(res.status, 302);
  const location = new URL(res.headers.get("location"));
  assert.equal(location.origin + location.pathname, "https://github.com/login/oauth/authorize");
  assert.equal(location.searchParams.get("client_id"), "test-client-id");
  assert.ok(location.searchParams.get("state"));
});

test("OAuth callback rejects a mismatched state", async () => {
  const res = await api("/auth/github/callback?code=abc&state=wrong");
  assert.equal(res.status, 400);
});

test("settings can be read and updated", async () => {
  let res = await api("/auth/me", { user: bob });
  assert.equal(res.body.username, "bob");
  assert.equal(res.body.email, null);
  assert.equal("access_token" in res.body, false);

  res = await api("/auth/me", {
    user: bob,
    method: "PATCH",
    body: { email: "bob@example.com", timezone: "Asia/Colombo", reminders_enabled: false },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.email, "bob@example.com");
  assert.equal(res.body.timezone, "Asia/Colombo");
  assert.equal(res.body.reminders_enabled, false);

  res = await api("/auth/me", { user: bob, method: "PATCH", body: { email: "nope" } });
  assert.equal(res.status, 400);
  res = await api("/auth/me", { user: bob, method: "PATCH", body: { timezone: "Mars/Base" } });
  assert.equal(res.status, 400);

  await api("/auth/me", { user: bob, method: "PATCH", body: { email: null, reminders_enabled: true } });
});

test("todos are scoped to their owner", async () => {
  const created = await api("/api/todos", {
    user: alice,
    method: "POST",
    body: { title: "Write retro", due_date: "2030-01-01T09:00:00+05:30", linked_url: "https://github.com/a/b/pull/1" },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.due_date, "2030-01-01T03:30:00.000Z");

  assert.equal((await api("/api/todos", { user: alice })).body.length, 1);
  assert.equal((await api("/api/todos", { user: bob })).body.length, 0);

  const id = created.body.id;
  assert.equal((await api(`/api/todos/${id}`, { user: bob, method: "PUT", body: { done: true } })).status, 404);
  assert.equal((await api(`/api/todos/${id}`, { user: bob, method: "DELETE" })).status, 404);

  const updated = await api(`/api/todos/${id}`, { user: alice, method: "PUT", body: { done: true } });
  assert.equal(updated.body.done, 1);
  assert.equal(updated.body.title, "Write retro");

  assert.equal((await api(`/api/todos/${id}`, { user: alice, method: "DELETE" })).status, 204);
});

test("todo input is validated", async () => {
  const cases = [
    { title: "" },
    { title: "x", due_date: "not a date" },
    { title: "x", due_date: "2026-02-30" },
    { title: "x", linked_url: "javascript:alert(1)" },
  ];
  for (const body of cases) {
    const res = await api("/api/todos", { user: alice, method: "POST", body });
    assert.equal(res.status, 400, JSON.stringify(body));
  }
});

test("diary keeps one entry per day and is scoped to its owner", async () => {
  const first = await api("/api/diary", {
    user: alice,
    method: "POST",
    body: { entry_date: "2026-09-20", content: "first" },
  });
  assert.equal(first.status, 201);

  const second = await api("/api/diary", {
    user: alice,
    method: "POST",
    body: { entry_date: "2026-09-20", content: "second" },
  });
  assert.equal(second.status, 200);
  assert.equal(second.body.id, first.body.id);
  assert.equal(second.body.content, "second");

  await api("/api/diary", { user: alice, method: "POST", body: { entry_date: "2026-10-01", content: "oct" } });

  const september = await api("/api/diary?from=2026-09-01&to=2026-09-30", { user: alice });
  assert.deepEqual(september.body.map((e) => e.entry_date), ["2026-09-20"]);

  assert.equal((await api("/api/diary/date/2026-09-20", { user: alice })).body.content, "second");
  assert.equal((await api("/api/diary/date/2026-09-20", { user: bob })).status, 404);
  assert.equal((await api("/api/diary", { user: bob })).body.length, 0);
  assert.equal(
    (await api(`/api/diary/${first.body.id}`, { user: bob, method: "PUT", body: { content: "x" } })).status,
    404
  );
  assert.equal(
    (await api("/api/diary", { user: alice, method: "POST", body: { entry_date: "20-9-2026", content: "x" } })).status,
    400
  );
});

test("reminders email due todos once, and re-arm when the due date moves", async () => {
  const past = new Date(Date.now() - 60_000).toISOString();
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const due = (await api("/api/todos", { user: alice, method: "POST", body: { title: "Due now", due_date: past } })).body;
  await api("/api/todos", { user: alice, method: "POST", body: { title: "Later", due_date: future } });
  const doneTodo = (await api("/api/todos", { user: alice, method: "POST", body: { title: "Done", due_date: past } })).body;
  await api(`/api/todos/${doneTodo.id}`, { user: alice, method: "PUT", body: { done: true } });
  // Bob has no email address, so his due todo is skipped.
  await api("/api/todos", { user: bob, method: "POST", body: { title: "Bob's", due_date: past } });

  const logs = [];
  const originalLog = console.log;
  console.log = (msg) => logs.push(String(msg));
  let result;
  try {
    result = await runReminderCheck();
  } finally {
    console.log = originalLog;
  }

  assert.deepEqual(result, { remindersSent: 1, usersNotified: 1 });
  assert.match(logs.join("\n"), /To: alice@example\.com/);
  assert.match(logs.join("\n"), /Due now/);

  assert.deepEqual(await runReminderCheck(), { remindersSent: 0, usersNotified: 0 });

  const moved = await api(`/api/todos/${due.id}`, { user: alice, method: "PUT", body: { due_date: future } });
  assert.equal(moved.body.reminder_sent_at, null);
});

test("GitHub activity is fetched for the user's local day and drafted as markdown", async () => {
  const calls = [];
  githubHandler = async (url, options) => {
    const { query, variables } = JSON.parse(options.body);
    calls.push({ url, query, variables, auth: options.headers.Authorization });
    const issueData = {
      viewer: {
        contributionsCollection: {
          issueContributions: {
            nodes: [
              {
                occurredAt: "2026-09-20T11:00:00Z",
                issue: { title: "Crash on start", url: "https://github.com/alice/app/issues/3", number: 3, state: "OPEN", repository: { nameWithOwner: "alice/app" } },
              },
            ],
          },
        },
      },
    };
    const data = query.includes("issueContributions")
      ? issueData
      : query.includes("contributionsCollection")
      ? {
          viewer: {
            id: "U_alice",
            login: "alice",
            contributionsCollection: {
              commitContributionsByRepository: [
                { repository: { nameWithOwner: "alice/app", url: "https://github.com/alice/app" }, contributions: { totalCount: 2 } },
              ],
              pullRequestContributions: {
                nodes: [
                  {
                    occurredAt: "2026-09-20T10:00:00Z",
                    pullRequest: { title: "Add login", url: "https://github.com/alice/app/pull/7", number: 7, state: "MERGED", repository: { nameWithOwner: "alice/app" } },
                  },
                ],
              },
              pullRequestReviewContributions: { nodes: [] },
            },
          },
        }
      : {
          r0: {
            defaultBranchRef: {
              target: {
                history: {
                  nodes: [
                    { oid: "abcdef1234567", messageHeadline: "Fix bug", url: "https://github.com/alice/app/commit/abcdef1", committedDate: "2026-09-20T09:00:00Z" },
                  ],
                },
              },
            },
          },
        };
    return new Response(JSON.stringify({ data }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  // UTC+05:30 → getTimezoneOffset() is -330.
  const res = await api("/api/github/activity?date=2026-09-20&tzOffset=-330", { user: alice });
  assert.equal(res.status, 200);
  assert.equal(calls[0].variables.from, "2026-09-19T18:30:00.000Z");
  assert.equal(calls[0].variables.to, "2026-09-20T18:29:59.000Z");
  assert.equal(calls[0].auth, "Bearer token-alice");
  assert.match(calls[1].query, /repository\(owner: "alice", name: "app"\)/);
  assert.equal(calls[1].variables.authorId, "U_alice");

  assert.deepEqual(res.body.totals, { commits: 2, pullRequests: 1, reviews: 0, issues: 1 });
  assert.match(res.body.markdown, /## What I worked on — 2026-09-20/);
  assert.match(res.body.markdown, /### Issues\n- Opened \[Crash on start\]/);
  assert.match(res.body.markdown, /Opened \[Add login\]\(https:\/\/github\.com\/alice\/app\/pull\/7\)/);
  assert.match(res.body.markdown, /`abcdef1`.*Fix bug/);
});

test("expired GitHub tokens are refreshed before use", async () => {
  db.prepare("UPDATE users SET token_expires_at = ?, refresh_token = ? WHERE id = ?").run(
    new Date(Date.now() - 1000).toISOString(),
    "refresh-1",
    bob.id
  );

  const seen = [];
  githubHandler = async (url, options) => {
    if (url === "https://github.com/login/oauth/access_token") {
      assert.equal(JSON.parse(options.body).refresh_token, "refresh-1");
      return Response.json({ access_token: "fresh", refresh_token: "refresh-2", expires_in: 28800, refresh_token_expires_in: 15811200 });
    }
    seen.push(options.headers.Authorization);
    return Response.json({
      data: {
        viewer: {
          id: "U_bob",
          login: "bob",
          contributionsCollection: {
            commitContributionsByRepository: [],
            pullRequestContributions: { nodes: [] },
            pullRequestReviewContributions: { nodes: [] },
            issueContributions: { nodes: [] },
          },
        },
      },
    });
  };

  const res = await api("/api/github/activity?date=2026-09-20", { user: bob });
  assert.equal(res.status, 200);
  assert.deepEqual(seen, ["Bearer fresh", "Bearer fresh"]);
  assert.match(res.body.markdown, /No GitHub activity/);

  const stored = db.prepare("SELECT access_token, refresh_token FROM users WHERE id = ?").get(bob.id);
  assert.deepEqual({ ...stored }, { access_token: "fresh", refresh_token: "refresh-2" });
});

test("a rejected GitHub token asks the client to sign in again", async () => {
  githubHandler = async () => new Response("{}", { status: 401 });
  for (const path of ["/api/github/activity?date=2026-09-20", "/api/github/repos", "/api/github/repos/alice/app"]) {
    const res = await api(path, { user: alice });
    assert.equal(res.status, 401, path);
    assert.equal(res.body.reauth, true, path);
  }
});

test("repositories are listed across every installation, paginated and de-duplicated", async () => {
  const repo = (id, name, pushedAt) => ({
    id,
    full_name: `alice/${name}`,
    name,
    owner: { login: "alice" },
    html_url: `https://github.com/alice/${name}`,
    description: null,
    private: id % 2 === 0,
    fork: false,
    archived: false,
    language: "JavaScript",
    stargazers_count: 1,
    forks_count: 0,
    open_issues_count: 2,
    default_branch: "main",
    pushed_at: pushedAt,
  });
  const page1 = Array.from({ length: 100 }, (_, i) => repo(i + 1, `repo${i + 1}`, "2026-01-01T00:00:00Z"));
  const page2 = [repo(101, "newest", "2026-09-01T00:00:00Z")];

  const paths = [];
  githubHandler = async (url) => {
    const { pathname, searchParams } = new URL(url);
    paths.push(pathname + (searchParams.get("page") ? `?page=${searchParams.get("page")}` : ""));
    if (pathname === "/user/installations") {
      return Response.json({
        total_count: 2,
        installations: [
          { id: 10, account: { login: "alice" }, repository_selection: "all", html_url: "https://github.com/settings/installations/10" },
          { id: 20, account: { login: "acme" }, repository_selection: "selected", html_url: "https://github.com/organizations/acme/settings/installations/20" },
        ],
      });
    }
    if (pathname === "/user/installations/10/repositories") {
      const page = searchParams.get("page");
      return Response.json({ total_count: 101, repositories: page === "1" ? page1 : page2 });
    }
    // The acme installation also exposes a repo already seen via alice's.
    return Response.json({ total_count: 1, repositories: [repo(101, "newest", "2026-09-01T00:00:00Z")] });
  };

  const res = await api("/api/github/repos", { user: alice });
  assert.equal(res.status, 200);
  assert.equal(res.body.repositories.length, 101);
  assert.equal(res.body.repositories[0].fullName, "alice/newest");
  assert.equal(res.body.installations.length, 2);
  assert.match(res.body.installUrl, /^https:\/\/github\.com\/apps\/[\w-]+\/installations\/new$/);
  assert.ok(paths.includes("/user/installations/10/repositories?page=2"));
});

test("repository details include commits, PRs and issues, tolerating missing issue access", async () => {
  githubHandler = async (_url, options) => {
    const { query, variables } = JSON.parse(options.body);
    assert.deepEqual(variables, { owner: "alice", name: "app" });
    if (query.includes("issues(")) {
      return Response.json({ data: { repository: null }, errors: [{ message: "Resource not accessible by integration" }] });
    }
    return Response.json({
      data: {
        repository: {
          nameWithOwner: "alice/app",
          url: "https://github.com/alice/app",
          description: "An app",
          isPrivate: true,
          stargazerCount: 3,
          forkCount: 1,
          primaryLanguage: { name: "TypeScript" },
          defaultBranchRef: {
            name: "main",
            target: {
              history: {
                totalCount: 42,
                nodes: [{ oid: "abc1234", messageHeadline: "Init", url: "https://github.com/alice/app/commit/abc1234", committedDate: "2026-09-20T09:00:00Z", author: { name: "Alice", user: { login: "alice" } } }],
              },
            },
          },
          pullRequests: {
            totalCount: 1,
            nodes: [{ number: 7, title: "Add login", url: "https://github.com/alice/app/pull/7", isDraft: false, updatedAt: "2026-09-20T10:00:00Z", author: { login: "alice" } }],
          },
        },
      },
    });
  };

  const res = await api("/api/github/repos/alice/app", { user: alice });
  assert.equal(res.status, 200);
  assert.equal(res.body.commits.totalCount, 42);
  assert.equal(res.body.commits.items[0].author, "alice");
  assert.equal(res.body.pullRequests.items[0].title, "Add login");
  assert.equal(res.body.issues, null);
  assert.match(res.body.issuesError, /Issues/);

  assert.equal((await api("/api/github/repos/alice/..%2F..%2Fetc", { user: alice })).status, 400);
});

test("the contribution graph maps GitHub's quartiles to levels 0–4", async () => {
  githubHandler = async () =>
    Response.json({
      data: {
        viewer: {
          contributionsCollection: {
            contributionCalendar: {
              totalContributions: 7,
              weeks: [
                {
                  contributionDays: [
                    { date: "2026-09-20", weekday: 0, contributionCount: 0, contributionLevel: "NONE" },
                    { date: "2026-09-21", weekday: 1, contributionCount: 7, contributionLevel: "FOURTH_QUARTILE" },
                  ],
                },
              ],
            },
          },
        },
      },
    });

  const res = await api("/api/github/contributions", { user: alice });
  assert.equal(res.status, 200);
  assert.equal(res.body.totalContributions, 7);
  assert.deepEqual(res.body.weeks[0][1], { date: "2026-09-21", weekday: 1, count: 7, level: 4 });
});

test("installing the app from GitHub restarts sign-in instead of failing the state check", async () => {
  const res = await api("/auth/github/callback?code=abc&installation_id=123&setup_action=install");
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "/auth/github");
});

test("webhooks verify signatures and clear tokens when access is revoked", async () => {
  const crypto = require("node:crypto");
  const sign = (body, secret) => `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
  const send = (body, signature, event = "github_app_authorization") =>
    realFetch(`${baseUrl}/webhooks/github`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-GitHub-Event": event, "X-Hub-Signature-256": signature },
      body,
    });

  const carol = createUser(3, "carol");
  const body = JSON.stringify({ action: "revoked", sender: { id: 3, login: "carol" } });

  delete process.env.GITHUB_WEBHOOK_SECRET;
  assert.equal((await send(body, sign(body, "whsec"))).status, 503);

  process.env.GITHUB_WEBHOOK_SECRET = "whsec";
  try {
    assert.equal((await send(body, sign(body, "wrong"))).status, 401);
    assert.equal((await send(body, "")).status, 401);
    assert.equal(db.prepare("SELECT access_token FROM users WHERE id = ?").get(carol.id).access_token, "token-carol");

    assert.equal((await send(body, sign(body, "whsec"))).status, 204);
    assert.equal(db.prepare("SELECT access_token FROM users WHERE id = ?").get(carol.id).access_token, "");

    // With no token left, GitHub calls ask the user to sign in again.
    const res = await api("/api/github/repos", { user: carol });
    assert.equal(res.status, 401);
    assert.equal(res.body.reauth, true);

    const ping = JSON.stringify({ zen: "hi" });
    assert.equal((await send(ping, sign(ping, "whsec"), "ping")).status, 204);
  } finally {
    delete process.env.GITHUB_WEBHOOK_SECRET;
  }
});

// --- VS Code extension sign-in and API tokens ---

const { pkceChallenge, createAuthCode } = require("../src/services/apiTokens");
const EXTENSION_REDIRECT = "vscode://krishmal2004.devdiary2026/auth";
const STATE = "state-abcdefghijklmnop";

// A browser-like client that keeps the session cookie between requests.
function browser(user) {
  const jar = new Map();
  if (user) {
    for (const part of sessionCookie(user.id).split("; ")) {
      const [name, ...value] = part.split("=");
      jar.set(name, value.join("="));
    }
  }
  return async (path, { method = "GET", form } = {}) => {
    const response = await realFetch(`${baseUrl}${path}`, {
      method,
      redirect: "manual",
      headers: {
        Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
        ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      },
      body: form ? new URLSearchParams(form).toString() : undefined,
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(";");
      const [name, ...value] = pair.split("=");
      jar.set(name, value.join("="));
    }
    return { status: response.status, location: response.headers.get("location"), text: await response.text() };
  };
}

function startQuery(overrides = {}) {
  const verifier = require("node:crypto").randomBytes(32).toString("base64url");
  const params = {
    state: STATE,
    code_challenge: pkceChallenge(verifier),
    code_challenge_method: "S256",
    redirect_uri: EXTENSION_REDIRECT,
    client_name: "VS Code on test-host",
    ...overrides,
  };
  for (const [key, value] of Object.entries(params)) if (value === undefined) delete params[key];
  return { verifier, query: new URLSearchParams(params).toString() };
}

function nonceFrom(html) {
  return /name="nonce" value="([^"]+)"/.exec(html)[1];
}

// Runs start → confirmation page → Allow and returns the one-time code.
async function authorizeCode(user, { redirect = true } = {}) {
  const b = browser(user);
  const start = startQuery(redirect ? {} : { redirect_uri: undefined });
  const started = await b(`/auth/vscode/start?${start.query}`);
  assert.equal(started.status, 302);
  assert.equal(started.location, "/auth/vscode/authorize");

  const confirm = await b("/auth/vscode/authorize");
  assert.equal(confirm.status, 200);
  assert.match(confirm.text, new RegExp(user.username));
  const nonce = nonceFrom(confirm.text);

  const allowed = await b("/auth/vscode/authorize", { method: "POST", form: { nonce, decision: "allow" } });
  assert.equal(allowed.status, 200);
  const code = /<code class="token">([^<]+)<\/code>/.exec(allowed.text)[1];
  if (redirect) {
    const refresh = /http-equiv="refresh" content="0;url=([^"]+)"/.exec(allowed.text)[1].replace(/&amp;/g, "&");
    const url = new URL(refresh);
    assert.equal(`${url.protocol}//${url.host}${url.pathname}`, EXTENSION_REDIRECT);
    assert.equal(url.searchParams.get("code"), code);
    assert.equal(url.searchParams.get("state"), STATE);
  } else {
    assert.doesNotMatch(allowed.text, /http-equiv="refresh"/);
  }

  // Each request allows one decision: a second Allow fails.
  const again = await b("/auth/vscode/authorize", { method: "POST", form: { nonce, decision: "allow" } });
  assert.equal(again.status, 400);
  return { code, verifier: start.verifier };
}

async function signInToken(user) {
  const { code, verifier } = await authorizeCode(user);
  const res = await api("/auth/vscode/token", { method: "POST", body: { code, code_verifier: verifier } });
  assert.equal(res.status, 200);
  return res.body.token;
}

test("VS Code sign-in exchanges a one-time code and PKCE verifier for an API token", async () => {
  const { code, verifier } = await authorizeCode(alice);

  const res = await api("/auth/vscode/token", { method: "POST", body: { code, code_verifier: verifier } });
  assert.equal(res.status, 200);
  assert.match(res.body.token, /^ddv_[\w-]{43}$/);
  assert.equal(res.body.user.username, "alice");
  assert.equal("access_token" in res.body.user, false);

  // The code only works once.
  const reused = await api("/auth/vscode/token", { method: "POST", body: { code, code_verifier: verifier } });
  assert.equal(reused.status, 400);

  // The token authenticates API calls as its owner.
  const token = res.body.token;
  await api("/api/todos", { token, method: "POST", body: { title: "From VS Code" } });
  assert.deepEqual((await api("/api/todos", { user: alice })).body.map((t) => t.title), ["From VS Code"]);
  assert.equal((await api("/api/todos", { user: bob })).body.length, 0);
  assert.equal((await api("/auth/me", { token })).body.username, "alice");

  const listed = await api("/auth/tokens", { token });
  const mine = listed.body.find((t) => t.current);
  assert.equal(mine.name, "VS Code on test-host");
  assert.equal("token_hash" in mine, false);
  assert.ok(mine.last_used_at);

  // A bad bearer token is rejected even alongside a valid session cookie.
  const response = await realFetch(`${baseUrl}/api/todos`, {
    headers: { Authorization: "Bearer ddv_nope", Cookie: sessionCookie(alice.id) },
  });
  assert.equal(response.status, 401);

  // Sign out revokes the token.
  assert.equal((await api("/auth/tokens/current", { token, method: "DELETE" })).status, 204);
  assert.equal((await api("/api/todos", { token })).status, 401);
});

test("the token exchange rejects a wrong verifier, burning the code", async () => {
  const { code, verifier } = await authorizeCode(alice);
  const wrong = await api("/auth/vscode/token", { method: "POST", body: { code, code_verifier: "x".repeat(43) } });
  assert.equal(wrong.status, 400);
  const right = await api("/auth/vscode/token", { method: "POST", body: { code, code_verifier: verifier } });
  assert.equal(right.status, 400);
  assert.equal((await api("/auth/vscode/token", { method: "POST", body: {} })).status, 400);
});

test("expired sign-in codes are rejected", async () => {
  const verifier = "e".repeat(50);
  const code = createAuthCode({
    userId: alice.id,
    codeChallenge: pkceChallenge(verifier),
    clientName: "VS Code",
    now: Date.now() - 10 * 60 * 1000,
  });
  const res = await api("/auth/vscode/token", { method: "POST", body: { code, code_verifier: verifier } });
  assert.equal(res.status, 400);
});

test("without a redirect URI the confirmation page shows a code to paste", async () => {
  const { code, verifier } = await authorizeCode(bob, { redirect: false });
  const res = await api("/auth/vscode/token", { method: "POST", body: { code, code_verifier: verifier } });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.username, "bob");
});

test("VS Code sign-in validates the request and goes through GitHub when needed", async () => {
  const anonymous = browser(null);
  const bad = [
    { redirect_uri: "https://evil.example/auth" },
    { redirect_uri: "vscode://someone.else/auth" },
    { redirect_uri: "vscode://krishmal2004.devdiary2026/other" },
    { code_challenge_method: "plain" },
    { code_challenge: "short" },
    { state: "x" },
  ];
  for (const params of bad) {
    const res = await anonymous(`/auth/vscode/start?${startQuery(params).query}`);
    assert.equal(res.status, 400, JSON.stringify(params));
  }

  // Not signed in: GitHub sign-in first.
  assert.equal((await anonymous(`/auth/vscode/start?${startQuery().query}`)).location, "/auth/github");
  // Signed in but asking to refresh GitHub access: GitHub sign-in too.
  const signedIn = browser(alice);
  assert.equal((await signedIn(`/auth/vscode/start?${startQuery({ reauth: "1" }).query}`)).location, "/auth/github");

  // With no pending request, or a forged nonce, nothing is issued.
  assert.equal((await browser(alice)("/auth/vscode/authorize")).status, 400);
  await signedIn(`/auth/vscode/start?${startQuery().query}`);
  const forged = await signedIn("/auth/vscode/authorize", { method: "POST", form: { nonce: "forged", decision: "allow" } });
  assert.equal(forged.status, 400);

  // Cancel sends the editor an access_denied error and no code.
  await signedIn(`/auth/vscode/start?${startQuery().query}`);
  const nonce = nonceFrom((await signedIn("/auth/vscode/authorize")).text);
  const denied = await signedIn("/auth/vscode/authorize", { method: "POST", form: { nonce, decision: "deny" } });
  assert.match(denied.text, /error=access_denied/);
  assert.doesNotMatch(denied.text, /class="token"/);
});

test("the GitHub callback continues a pending VS Code sign-in", async () => {
  githubHandler = async (url) => {
    if (url === "https://github.com/login/oauth/access_token") {
      return Response.json({ access_token: "gh-token", refresh_token: "gh-refresh", expires_in: 28800, refresh_token_expires_in: 15811200 });
    }
    return Response.json({ id: 1, login: "alice", avatar_url: null, email: null });
  };
  const b = browser(null);
  await b(`/auth/vscode/start?${startQuery().query}`);
  const oauthState = new URL((await b("/auth/github")).location).searchParams.get("state");
  const callback = await b(`/auth/github/callback?code=gh-code&state=${oauthState}`);
  assert.equal(callback.status, 302);
  assert.equal(callback.location, "/auth/vscode/authorize");
  assert.equal((await b("/auth/vscode/authorize")).status, 200);
});

test("tokens can be listed and revoked from the dashboard, only by their owner", async () => {
  const token = await signInToken(alice);
  const [latest] = (await api("/auth/tokens", { user: alice })).body;
  assert.equal(latest.current, false);

  assert.equal((await api(`/auth/tokens/${latest.id}`, { user: bob, method: "DELETE" })).status, 404);
  assert.equal((await api("/auth/tokens/current", { user: alice, method: "DELETE" })).status, 400);
  assert.equal((await api(`/auth/tokens/${latest.id}`, { user: alice, method: "DELETE" })).status, 204);
  assert.equal((await api("/api/diary", { token })).status, 401);
});

test("revoking the GitHub App disconnects the user's editors", async () => {
  const crypto = require("node:crypto");
  const dave = createUser(4, "dave");
  const token = await signInToken(dave);
  assert.equal((await api("/api/todos", { token })).status, 200);

  const body = JSON.stringify({ action: "revoked", sender: { id: 4, login: "dave" } });
  process.env.GITHUB_WEBHOOK_SECRET = "whsec";
  try {
    const res = await realFetch(`${baseUrl}/webhooks/github`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-GitHub-Event": "github_app_authorization",
        "X-Hub-Signature-256": `sha256=${crypto.createHmac("sha256", "whsec").update(body).digest("hex")}`,
      },
      body,
    });
    assert.equal(res.status, 204);
  } finally {
    delete process.env.GITHUB_WEBHOOK_SECRET;
  }
  assert.equal((await api("/api/todos", { token })).status, 401);
});
