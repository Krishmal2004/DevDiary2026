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

async function api(path, { user, method = "GET", body } = {}) {
  const response = await realFetch(`${baseUrl}${path}`, {
    method,
    redirect: "manual",
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(user ? { Cookie: sessionCookie(user.id) } : {}),
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
    const data = query.includes("contributionsCollection")
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

  assert.deepEqual(res.body.totals, { commits: 2, pullRequests: 1, reviews: 0 });
  assert.match(res.body.markdown, /## What I worked on — 2026-09-20/);
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
          },
        },
      },
    });
  };

  const res = await api("/api/github/activity?date=2026-09-20", { user: bob });
  assert.equal(res.status, 200);
  assert.deepEqual(seen, ["Bearer fresh"]);
  assert.match(res.body.markdown, /No GitHub activity/);

  const stored = db.prepare("SELECT access_token, refresh_token FROM users WHERE id = ?").get(bob.id);
  assert.deepEqual({ ...stored }, { access_token: "fresh", refresh_token: "refresh-2" });
});

test("a rejected GitHub token asks the client to sign in again", async () => {
  githubHandler = async () => new Response("{}", { status: 401 });
  const res = await api("/api/github/activity?date=2026-09-20", { user: alice });
  assert.equal(res.status, 401);
  assert.equal(res.body.reauth, true);
});
