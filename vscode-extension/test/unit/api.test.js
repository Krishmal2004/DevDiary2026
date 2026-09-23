const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Api, ApiError, NotSignedInError, GitHubReauthError } = require("../../src/api");

function stubApi(respond, { token = "ddv_test" } = {}) {
  const calls = [];
  const api = new Api({
    getServerUrl: () => "http://devdiary.test/",
    getToken: async () => token,
    fetchImpl: async (url, options) => {
      calls.push({ url, ...options });
      return respond(url, options);
    },
  });
  return { api, calls };
}

const json = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});

test("requests carry the bearer token and a JSON body", async () => {
  const { api, calls } = stubApi(() => json(201, { id: 1, title: "x" }));
  const todo = await api.createTodo({ title: "x", due_date: null });
  assert.deepEqual(todo, { id: 1, title: "x" });
  assert.equal(calls[0].url, "http://devdiary.test/api/todos");
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].headers.Authorization, "Bearer ddv_test");
  assert.deepEqual(JSON.parse(calls[0].body), { title: "x", due_date: null });
});

test("a 204 resolves to null", async () => {
  const { api } = stubApi(() => new Response(null, { status: 204 }));
  assert.equal(await api.deleteTodo(3), null);
});

test("no stored token fails before any request", async () => {
  const { api, calls } = stubApi(() => json(200, []), { token: null });
  await assert.rejects(api.listTodos(), NotSignedInError);
  assert.equal(calls.length, 0);
});

test("401 means signed out, unless the backend asks for GitHub re-auth", async () => {
  let body = { error: "invalid or revoked API token" };
  const { api } = stubApi(() => json(401, body));
  await assert.rejects(api.listTodos(), NotSignedInError);
  body = { error: "GitHub token expired", reauth: true };
  await assert.rejects(api.activity("2026-09-23", -330), GitHubReauthError);
});

test("other errors carry the backend's message and status", async () => {
  const { api } = stubApi(() => json(400, { error: "title is required" }));
  await assert.rejects(api.createTodo({ title: "" }), (err) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 400);
    assert.equal(err.message, "title is required");
    return true;
  });
});

test("an unreachable server is reported clearly", async () => {
  const { api } = stubApi(() => {
    throw new TypeError("fetch failed");
  });
  await assert.rejects(api.listTodos(), /Could not reach DevDiary at http:\/\/devdiary\.test/);
});

test("getDiary returns null for a day without an entry", async () => {
  const { api, calls } = stubApi(() => json(404, { error: "not found" }));
  assert.equal(await api.getDiary("2026-09-23"), null);
  assert.equal(calls[0].url, "http://devdiary.test/api/diary/date/2026-09-23");
});

test("the code exchange is unauthenticated", async () => {
  const { api, calls } = stubApi(() => json(200, { token: "ddv_new", user: { username: "alice" } }), { token: null });
  const res = await api.exchangeCode("code", "verifier");
  assert.equal(res.token, "ddv_new");
  assert.equal(calls[0].headers.Authorization, undefined);
  assert.deepEqual(JSON.parse(calls[0].body), { code: "code", code_verifier: "verifier" });
});
