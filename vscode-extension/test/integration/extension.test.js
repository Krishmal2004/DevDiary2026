// Runs inside VS Code with the extension loaded (see .vscode-test.mjs),
// against a stub DevDiary server on a random local port.
const assert = require("node:assert/strict");
const http = require("node:http");
const vscode = require("vscode");

const TOKEN = "ddv_integration";
const DATE = "2026-09-20";

function startStubServer() {
  const state = {
    requests: [],
    todos: [
      { id: 1, title: "Overdue task", due_date: "2020-01-01", done: 0, linked_url: null, created_at: "2026-09-01 10:00:00", updated_at: "2026-09-01 10:00:00" },
      { id: 2, title: "Someday", due_date: null, done: 0, linked_url: null, created_at: "2026-09-01 10:00:00", updated_at: "2026-09-01 10:00:00" },
    ],
    entries: {
      [DATE]: { id: 7, entry_date: DATE, content: "Old entry", created_at: "2026-09-20 10:00:00", updated_at: "2026-09-20 10:00:00" },
    },
  };

  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const url = new URL(req.url, "http://localhost");
      state.requests.push({ method: req.method, path: url.pathname, auth: req.headers.authorization, body });
      const send = (status, data) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(data === undefined ? "" : JSON.stringify(data));
      };
      if (req.headers.authorization !== `Bearer ${TOKEN}`) return send(401, { error: "invalid or revoked API token" });

      const diaryMatch = /^\/api\/diary\/date\/(\d{4}-\d{2}-\d{2})$/.exec(url.pathname);
      if (req.method === "GET" && url.pathname === "/api/todos") return send(200, state.todos);
      if (req.method === "GET" && url.pathname === "/api/diary") return send(200, Object.values(state.entries));
      if (req.method === "GET" && diaryMatch) {
        const entry = state.entries[diaryMatch[1]];
        return entry ? send(200, entry) : send(404, { error: "not found" });
      }
      if (req.method === "POST" && url.pathname === "/api/diary") {
        const { entry_date, content } = JSON.parse(body);
        const entry = { id: 7, entry_date, content, created_at: "2026-09-20 10:00:00", updated_at: "2026-09-20 11:00:00" };
        state.entries[entry_date] = entry;
        return send(200, entry);
      }
      if (req.method === "GET" && url.pathname === "/api/github/activity") {
        return send(200, {
          date: url.searchParams.get("date"),
          commitRepos: [],
          pullRequests: [],
          reviews: [],
          issues: [],
          totals: { commits: 0, pullRequests: 0, reviews: 0, issues: 0 },
          markdown: "## Drafted\n",
        });
      }
      if (req.method === "DELETE" && url.pathname === "/auth/tokens/current") return send(204);
      send(404, { error: "not found" });
    });
  });

  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, state })));
}

async function waitFor(check, what, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

suite("DevDiary extension", () => {
  let stub;
  let ext;

  suiteSetup(async () => {
    stub = await startStubServer();
    const url = `http://127.0.0.1:${stub.server.address().port}`;
    await vscode.workspace.getConfiguration("devdiary").update("serverUrl", url, vscode.ConfigurationTarget.Global);
    await vscode.workspace.getConfiguration("devdiary").update("notifications.dueTodos", false, vscode.ConfigurationTarget.Global);
    const extension = vscode.extensions.getExtension("krishmal2004.devdiary2026");
    ext = await extension.activate();
  });

  suiteTeardown(async () => {
    await vscode.workspace.getConfiguration("devdiary").update("serverUrl", undefined, vscode.ConfigurationTarget.Global);
    await vscode.workspace.getConfiguration("devdiary").update("notifications.dueTodos", undefined, vscode.ConfigurationTarget.Global);
    stub.server.close();
  });

  test("registers its commands", async () => {
    const commands = await vscode.commands.getCommands(true);
    for (const id of ["devdiary.signIn", "devdiary.signOut", "devdiary.openToday", "devdiary.draftFromGitHub", "devdiary.addTodo"]) {
      assert.ok(commands.includes(id), id);
    }
  });

  test("a stored token signs in and loads todos and diary entries", async () => {
    assert.equal(ext.auth.signedIn, false);
    await ext.auth.context.secrets.store(ext.auth.secretKey(), TOKEN);
    await ext.auth.load();
    assert.equal(ext.auth.signedIn, true);

    await waitFor(() => ext.store.todos && ext.store.entries, "todos and entries");
    assert.deepEqual(ext.store.todos.map((t) => t.title), ["Overdue task", "Someday"]);
    assert.equal(ext.store.entries[0].entry_date, DATE);
    assert.ok(stub.state.requests.every((r) => r.auth === `Bearer ${TOKEN}`));
  });

  test("diary entries open as Markdown documents and save back to DevDiary", async () => {
    const uri = vscode.Uri.parse(`devdiary:/diary/${DATE}.md`);
    const document = await vscode.workspace.openTextDocument(uri);
    assert.equal(document.getText(), "Old entry");
    assert.equal(document.languageId, "markdown");

    const editor = await vscode.window.showTextDocument(document);
    await editor.edit((edit) => edit.insert(document.positionAt(document.getText().length), "\nMore notes"));
    assert.ok(await document.save());

    const post = stub.state.requests.find((r) => r.method === "POST" && r.path === "/api/diary");
    assert.deepEqual(JSON.parse(post.body), { entry_date: DATE, content: "Old entry\nMore notes" });
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  });

  test("a day without an entry opens empty", async () => {
    const document = await vscode.workspace.openTextDocument(vscode.Uri.parse("devdiary:/diary/2026-09-01.md"));
    assert.equal(document.getText(), "");
  });

  test("Draft from GitHub fills an empty entry", async () => {
    const uri = vscode.Uri.parse("devdiary:/diary/2026-09-02.md");
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri));
    await vscode.commands.executeCommand("devdiary.draftFromGitHub", uri);
    const document = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
    assert.equal(document.getText(), "## Drafted\n");
    assert.ok(stub.state.requests.some((r) => r.path === "/api/github/activity"));
    await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
  });

  test("signing out revokes the token on the server and forgets it", async () => {
    await vscode.commands.executeCommand("devdiary.signOut");
    assert.ok(stub.state.requests.some((r) => r.method === "DELETE" && r.path === "/auth/tokens/current"));
    assert.equal(ext.auth.signedIn, false);
    assert.equal(await ext.auth.getToken(), undefined);
    assert.equal(ext.store.todos, null);
  });
});
