# VS Code Extension

Design and build plan for the DevDiary2026 VS Code extension. It brings the diary, todos and today's GitHub activity into the editor, so you can log your day and check off tasks without switching to the browser.

> Status: **v0.1.0 built, not yet published.** The backend support, the dashboard's *Connected editors* list and the extension in [`vscode-extension/`](../vscode-extension) are done and tested. Still to do: a manual run on a real account, screenshots, and publishing (see [Build order](#build-order)).

## Table of Contents

- [Goals](#goals)
- [Features](#features)
- [User experience](#user-experience)
- [Authentication](#authentication)
- [Backend changes](#backend-changes)
- [Extension architecture](#extension-architecture)
- [Settings](#settings)
- [Development](#development)
- [Testing](#testing)
- [Packaging and publishing](#packaging-and-publishing)
- [Build order](#build-order)
- [Open questions](#open-questions)

## Goals

- **Stay in the editor.** Everything you do daily in the dashboard (write today's entry, add or finish a todo) works from VS Code.
- **Same account, same data.** The extension is another client of the existing backend. No separate storage and no sync logic.
- **Small and dependency-free.** Plain JavaScript (CommonJS, like `backend/`), Node's built-in `fetch`, and the VS Code API. No runtime dependencies, so no bundler is needed.
- **Safe sign-in.** The GitHub token never leaves the backend. The extension holds only a revocable DevDiary API token, kept in VS Code's `SecretStorage`.

**Non-goals for v1:** offline editing, changing reminder settings (the dashboard does that), the Repositories page, and the contribution graph.

## Features

### v1

| Feature | What it does | API used |
|---|---|---|
| Sign in / sign out | Browser-based GitHub sign-in that hands a token back to VS Code | `/auth/vscode/*` (new) |
| Today view | Today's commits, PRs, issues and reviews in the sidebar | `GET /api/github/activity` |
| Diary editing | Opens a day's entry as a normal Markdown document; saving it saves the entry | `GET /api/diary/date/:date`, `POST /api/diary` |
| Draft from GitHub | Fills today's entry with the markdown draft built from your activity | `GET /api/github/activity` (`markdown` field) |
| Recent entries | The last 30 days of entries, click to open | `GET /api/diary?from=&to=` |
| Todos view | Open todos grouped by Overdue / Today / Upcoming / No date, plus Done | `GET /api/todos` |
| Todo actions | Add, edit title, set due date, mark done / reopen, delete, open linked URL | `POST`, `PUT`, `DELETE /api/todos` |
| Status bar | `$(checklist) 3 due` count of overdue and due-today todos | `GET /api/todos` |
| Due notifications | An in-editor notification when a todo becomes due (alongside the email) | `GET /api/todos` (polled) |

### Later (v2 ideas)

- **Todo from a code comment.** A code action on `// TODO:` lines creates a todo whose `linked_url` is a GitHub permalink to that line, built from the git remote and the current commit through the built-in `vscode.git` extension API.
- **Todo from selection.** Right-click selected text → *DevDiary: Add Todo from Selection*.
- **End-of-day prompt.** At a configured local time, ask "Write today's diary?" with a button that drafts it from GitHub.
- **Unpushed work in the draft.** Add local commits that aren't on GitHub yet (from the `vscode.git` API) to the diary draft.
- **Settings view.** Reminder email, reminders on/off and time zone, through `PATCH /auth/me`.

## User experience

### Activity bar

A **DevDiary** container in the activity bar with three tree views:

```
DEVDIARY
├─ TODAY                              [refresh] [draft diary]
│   ├─ Commits (7)
│   │   ├─ Krishmal2004/DevDiary2026 — fix the UI
│   │   └─ …
│   ├─ Pull requests (1)
│   └─ Reviews (2)
├─ TODOS                              [add] [refresh] [show done]
│   ├─ Overdue (1)
│   │   └─ Renew SSL cert           · due yesterday
│   ├─ Today (2)
│   ├─ Upcoming (4)
│   └─ No date (3)
└─ DIARY                              [open today] [refresh]
    ├─ Today — Wed 23 Sep
    ├─ Tue 22 Sep
    └─ …
```

- Clicking a commit, PR or review opens it on GitHub.
- Clicking a todo opens its linked URL if it has one; otherwise it starts editing the title.
- Todo items have inline actions (check to mark done) and a context menu (Edit title, Set due date, Delete).
- When signed out, each view shows a welcome message with a **Sign in with GitHub** button (`viewsWelcome`).

### Diary documents

Diary entries open as real editor tabs through a `FileSystemProvider` on the `devdiary:` scheme:

```
devdiary:/diary/2026-09-23.md
```

- **Read:** `GET /api/diary/date/2026-09-23`. A 404 opens an empty document, so a new entry is just a new file.
- **Write:** on save, `POST /api/diary` with `{ entry_date, content }`. The backend creates or replaces the entry.
- **Empty save:** the API rejects blank content, so saving an empty document asks whether to delete the entry (`DELETE /api/diary/:id`).
- Markdown highlighting, the built-in preview (`Ctrl+Shift+V`) and spell-check extensions all work, because it is an ordinary `.md` document.

**Draft from GitHub** inserts the activity `markdown` into the open entry. If the entry already has text, it asks: *Replace*, *Append* or *Cancel*.

### Commands

All commands are in the Command Palette under the `DevDiary:` category.

| Command | ID | Default keybinding |
|---|---|---|
| Sign In with GitHub | `devdiary.signIn` | — |
| Sign Out | `devdiary.signOut` | — |
| Open Today's Diary | `devdiary.openToday` | `Ctrl+Alt+D` / `Cmd+Alt+D` |
| Open Diary for Date… | `devdiary.openDate` | — |
| Draft Diary from GitHub | `devdiary.draftFromGitHub` | — |
| Add Todo | `devdiary.addTodo` | `Ctrl+Alt+T` / `Cmd+Alt+T` |
| Mark Todo Done / Reopen | `devdiary.toggleTodo` | — |
| Edit Todo / Set Due Date / Delete Todo | `devdiary.editTodo`, `devdiary.setDueDate`, `devdiary.deleteTodo` | — |
| Refresh | `devdiary.refresh` | — |
| Open Dashboard | `devdiary.openDashboard` | — |

**Add Todo** uses two quick inputs: the title, then an optional due date. The date picker offers *Today*, *Tomorrow*, *Next Monday*, *No date* and *Custom…* (typed as `YYYY-MM-DD` or `YYYY-MM-DD HH:mm`, local time). A timed due date is converted to a UTC ISO timestamp before sending, which is what the dashboard does too.

### Status bar and notifications

- The status bar item shows the number of open todos that are overdue or due today. It is hidden when that number is 0. Clicking it focuses the Todos view.
- Every `devdiary.refreshInterval` minutes the extension refetches todos. When an open todo crosses its due time, it shows one notification with **Mark done**, **Snooze 1h** (moves the due date, which also re-arms the email reminder) and **Open** buttons. Todos already notified are remembered in `globalState`, so each fires once per due date.

## Authentication

The backend today only knows **cookie sessions**, which a VS Code extension can't use. The extension instead signs in through the browser and gets a **DevDiary API token** that it sends as `Authorization: Bearer <token>`.

### Sign-in flow

This is an authorization-code flow with PKCE, using VS Code's `UriHandler` to receive the result.

```
VS Code extension             Browser                      Backend                      GitHub
      │ 1. make state, verifier,  │                             │                            │
      │    challenge=SHA256(verifier)                           │                            │
      │── openExternal ──────────▶│ GET /auth/vscode/start      │                            │
      │                           │  ?state&code_challenge      │                            │
      │                           │  &redirect_uri ────────────▶│ 2. validate, remember in   │
      │                           │                             │    session, send to sign-in│
      │                           │◀──── /auth/github ──────────│───────────────────────────▶│
      │                           │                   3. normal GitHub sign-in (skipped if    │
      │                           │                      already signed in to the dashboard)  │
      │                           │ GET /auth/vscode/authorize ◀┤                            │
      │                           │ 4. "Allow VS Code to access │                            │
      │                           │    your DevDiary?" [Allow] ─▶ 5. make one-time code      │
      │◀── vscode://…/auth?code&state ──────────────────────────│   (5 min, single use)      │
      │ 6. check state                                          │                            │
      │── POST /auth/vscode/token {code, code_verifier} ───────▶│ 7. verify, mint API token  │
      │◀───────────────────────────── { token, user } ──────────│                            │
      │ 8. store token in SecretStorage                         │                            │
```

1. The extension generates a random `state`, a PKCE `code_verifier` and its `code_challenge` (SHA-256, base64url). It builds its callback URI with `vscode.env.asExternalUri(vscode.Uri.parse(`${vscode.env.uriScheme}://${context.extension.id}/auth`))`. Using `asExternalUri` and `uriScheme` makes the flow work in VS Code Insiders, VSCodium, Remote-SSH and Codespaces.
2. The backend checks that `redirect_uri` is allowed (see below), stores `{ state, code_challenge, redirect_uri }` in the session, and sends the browser through the normal GitHub sign-in.
3. After the GitHub callback, instead of redirecting to the dashboard, the backend sees the pending VS Code request and redirects to `/auth/vscode/authorize`.
4. That page names the account and asks for confirmation. Nothing is issued without a click, so a link to `/auth/vscode/start` on another website can't silently connect an editor.
5. The **Allow** button (a `POST`) creates a random one-time code, stores its hash with the user and `code_challenge`, and redirects to `redirect_uri?code=…&state=…`.
6. The extension's `UriHandler` receives the URI and checks that `state` matches the sign-in it started.
7. The extension exchanges the code. The backend checks the code is unused and unexpired and that `SHA256(code_verifier)` matches the stored challenge. It then marks the code used and mints an API token.
8. The token goes into `context.secrets`. The extension never sees a GitHub token.

Because the long-lived token is returned in a `POST` response, it never appears in a URL, browser history or OS logs. PKCE means a code intercepted from the `vscode://` URI is useless without the verifier.

**Allowed redirect URIs.** The scheme must be `vscode`, `vscode-insiders` or `vscodium`, the authority must be the extension's ID (`VSCODE_EXTENSION_ID`, default `krishmal2004.devdiary2026`) and the path `/auth`. Anything else is rejected with 400. `https` callbacks are deliberately not accepted: anyone can host an `https` page, so an attacker could start a sign-in, send the link to a victim and collect the code.

**Paste-code fallback.** The Allow page always shows the one-time code too. If the `vscode://` handoff fails (some Linux desktops don't register the handler), the user picks **Paste Code** on the "Finish signing in" notification, or runs **DevDiary: Paste Sign-In Code**. Browser-based editors, where `asExternalUri` returns an `https` URI, leave out `redirect_uri` altogether: the page then shows only the code, and the extension asks for it straight away.

**GitHub re-authorization.** `/auth/vscode/start?…&reauth=1` always goes through GitHub sign-in, even if the browser is already signed in to the dashboard. The extension uses it when the backend reports `reauth: true`.

### API tokens

- Format: `ddv_` + 32 random bytes in base64url. The prefix makes leaked tokens easy to spot and to add to secret scanning.
- Only the SHA-256 hash is stored, so a database leak doesn't expose usable tokens.
- Tokens don't expire on a timer; they're revoked. Revoking happens on **Sign Out** in the extension, from a new **Connected editors** list in the dashboard's Settings, and automatically when the GitHub App is revoked (the existing webhook already clears the user's GitHub tokens, and it will also delete their API tokens).
- `last_used_at` is updated at most once a minute per token, to show in **Connected editors**.

### When GitHub needs re-authorization

The GitHub routes return `401 { reauth: true }` when the stored GitHub token can't be refreshed. The DevDiary API token is still valid, so the extension keeps working for diary and todos. It shows *"GitHub access expired — sign in again to see activity"* with a **Sign in** button that reruns the flow above, which refreshes the GitHub tokens on the backend.

## Backend changes

### Migration 3

Append to `backend/src/db/migrations.js`:

```sql
CREATE TABLE api_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                 -- e.g. "VS Code on DESKTOP-1234"
  token_hash TEXT NOT NULL UNIQUE,    -- SHA-256 hex
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT
);

CREATE TABLE auth_codes (
  code_hash TEXT PRIMARY KEY,         -- SHA-256 hex of the one-time code
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_challenge TEXT NOT NULL,
  client_name TEXT NOT NULL,
  expires_at TEXT NOT NULL,           -- 5 minutes after creation
  used_at TEXT
);

CREATE INDEX idx_api_tokens_user ON api_tokens (user_id);
```

Expired `auth_codes` rows are deleted each time a new code is created, so no scheduled cleanup is needed.

### `requireAuth`

`backend/src/middleware/requireAuth.js` accepts either form:

1. `Authorization: Bearer ddv_…` → hash it, look up `api_tokens`, load the user.
2. Otherwise the existing session cookie.

A request with a bearer header that doesn't match is rejected with 401 and doesn't fall back to the cookie.

### New routes

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/auth/vscode/start` | none | Validates `state`, `code_challenge` (`S256` only), optional `redirect_uri`, `client_name` and `reauth`; stores them in the session for 10 minutes; continues to GitHub sign-in, or straight to `/auth/vscode/authorize` if already signed in |
| GET | `/auth/vscode/authorize` | session | Confirmation page |
| POST | `/auth/vscode/authorize` | session | Allow or Cancel (form post with a per-request nonce). Allow creates the one-time code, returns to `redirect_uri` and shows the code for pasting |
| POST | `/auth/vscode/token` | none | `{ code, code_verifier }` → `{ token, user }` |
| GET | `/auth/tokens` | session or token | Lists the user's tokens (id, name, created, last used). Never returns the token |
| DELETE | `/auth/tokens/:id` | session or token | Revokes one token |
| DELETE | `/auth/tokens/current` | token | Revokes the token making the request (used by **Sign Out**) |

`/auth/github/callback` gets one change: after signing in, if the session holds a pending VS Code request, redirect to `/auth/vscode/authorize` instead of `APP_BASE_URL`.

### Other backend work

- **CORS** needs no change. The extension calls the API from the Node extension host, not a browser page.
- **CSRF.** Bearer tokens aren't sent automatically by browsers, so token-authenticated requests aren't exposed to CSRF. The confirmation step and its `POST` protect the one cookie-authenticated step that issues credentials.
- **Rate limiting** on `POST /auth/vscode/token`: 20 per minute per IP, in memory. The code is 32 random bytes, so this is defence in depth. A wrong verifier also burns the code.
- **Webhook.** On `github_app_authorization` → `revoked`, also `DELETE FROM api_tokens WHERE user_id = ?`.
- **Dashboard.** A **Connected editors** section in `SettingsDialog.jsx` listing tokens with a **Revoke** button.
- **Tests** in `backend/test/api.test.js`: the full code exchange; wrong verifier, reused code and expired code all fail; bearer auth works on `/api/*`; a revoked token gets 401; a bad bearer header doesn't fall back to the cookie; a disallowed `redirect_uri` is rejected.
- **Code.** `services/apiTokens.js` (hashing, codes, tokens), `routes/vscodeAuth.js`, `routes/tokens.js`, and `users.js` for the shared `publicUser()`.

## Extension architecture

### Code layout

A new top-level folder, alongside `backend/` and `frontend/`:

```
vscode-extension/
  package.json          extension manifest: commands, views, menus, settings, keybindings
  README.md             Marketplace page (with screenshots)
  CHANGELOG.md
  LICENSE
  media/
    icon.png            128×128 Marketplace icon
    activity-bar.svg    monochrome activity bar icon
  src/
    extension.js        activate(): wires everything up; deactivate()
    api.js              fetch wrapper: base URL, Bearer header, JSON, error mapping
    auth.js             sign-in flow, UriHandler, SecretStorage, sign-out
    state.js            cached todos/entries/activity with change events
    dates.js            local-date helpers (today, tzOffset, due-date parsing and labels)
    diaryFileSystem.js  FileSystemProvider for devdiary:/diary/YYYY-MM-DD.md
    views/
      todayView.js      TreeDataProvider for today's GitHub activity
      todosView.js      TreeDataProvider for todos
      diaryView.js      TreeDataProvider for recent entries
    commands/
      diary.js          open today / open date / draft from GitHub
      todos.js          add / edit / due date / toggle / delete
    statusBar.js        due-count status bar item
    notifier.js         polling and due notifications
  test/
    unit/               node:test for dates.js and api.js
    integration/        runs inside VS Code against a stub DevDiary server
  .vscode-test.mjs      integration test config (@vscode/test-cli)
  .vscodeignore
  eslint.config.js
```

### Key pieces

- **`api.js`** is the only module that talks to the network. It reads `devdiary.serverUrl`, adds the bearer token, and turns responses into typed errors: `NotSignedInError` (401 without `reauth`, which clears the stored token and shows the signed-out views), `GitHubReauthError` (401 with `reauth: true`), and `ApiError` for everything else, carrying the backend's `error` message.
- **`state.js`** holds the last fetched data and fires `onDidChange`. Views, the status bar and the notifier all read from it, so one refresh updates everything and there's one request per resource per refresh.
- **Refreshing** happens on activation, on window focus (if the last refresh is older than a minute), after every mutation, on the **Refresh** command, and every `devdiary.refreshInterval` minutes.
- **Context keys.** `devdiary.signedIn` controls which view contents and menu items appear. `devdiary.showDone` toggles the Done group.
- **Activation events.** `onView:devdiary.*`, `onCommand:devdiary.*`, `onFileSystem:devdiary` and `onUri`. Nothing runs on startup unless the sidebar is open or a command is used.
- **Time zones.** "Today" is always the editor machine's local date. `tzOffset` for `/api/github/activity` is that day's `getTimezoneOffset()`, which is what the dashboard sends.
- **Line endings.** Diary entries are saved with LF endings. New documents default to CRLF on Windows, so `writeFile` normalizes before saving.
- **Activity refresh.** Today's activity costs several GitHub API calls, so the background timer only refetches it while the Today view is visible or when the date rolls over. Opening the view refetches it if it's more than 10 minutes old.

### Manifest highlights

```jsonc
{
  "name": "devdiary2026",
  "displayName": "DevDiary",
  "publisher": "krishmal2004",
  "engines": { "vscode": "^1.90.0" },
  "main": "./src/extension.js",
  "categories": ["Other"],
  "contributes": {
    "viewsContainers": {
      "activitybar": [{ "id": "devdiary", "title": "DevDiary", "icon": "media/activity-bar.svg" }]
    },
    "views": {
      "devdiary": [
        { "id": "devdiary.today", "name": "Today" },
        { "id": "devdiary.todos", "name": "Todos" },
        { "id": "devdiary.diary", "name": "Diary" }
      ]
    },
    "viewsWelcome": [
      { "view": "devdiary.todos", "contents": "Sign in to see your todos.\n[Sign in with GitHub](command:devdiary.signIn)", "when": "!devdiary.signedIn" }
    ]
  }
}
```

VS Code 1.90 ships Node 20, so the global `fetch` is available.

## Settings

| Setting | Default | Description |
|---|---|---|
| `devdiary.serverUrl` | `http://localhost:4000` | DevDiary backend to use. Change it to your deployed or self-hosted URL |
| `devdiary.refreshInterval` | `5` | Minutes between background refreshes (minimum 1) |
| `devdiary.notifications.dueTodos` | `true` | Show a notification when a todo becomes due |
| `devdiary.statusBar.enabled` | `true` | Show the due-todo count in the status bar |
| `devdiary.diary.draftMode` | `"ask"` | What **Draft from GitHub** does when the entry has text: `ask`, `append` or `replace` |

Tokens are stored per server URL in `SecretStorage`, so each server keeps its own sign-in and switching back restores it. **Open Dashboard** opens `serverUrl`, which serves the dashboard in production; in local development the dashboard is on the Vite port instead.

## Development

1. Start the backend as usual: `npm run dev` from the repo root (see [setup.md](./setup.md)).
2. Open the repo in VS Code and run the **Run Extension** launch configuration (`.vscode/launch.json`, pointing `--extensionDevelopmentPath` at `vscode-extension/`). A second VS Code window opens with the extension loaded.
3. In that window, set `devdiary.serverUrl` to `http://localhost:4000` and run **DevDiary: Sign In**.

Root scripts to add to `package.json`:

| Script | What it does |
|---|---|
| `npm run ext:lint` | ESLint over `vscode-extension/src` and `test` |
| `npm run ext:test` | Unit tests, then integration tests in a downloaded VS Code (cached in `vscode-extension/.vscode-test/`) |
| `npm run ext:package` | Builds `vscode-extension/devdiary2026-<version>.vsix` |

`npm run setup` now installs the extension's dev dependencies too.

To try a packaged build: **Extensions → … → Install from VSIX…**.

## Testing

- **Backend tests** in `backend/test/api.test.js` cover the whole sign-in flow and token management (see [Backend changes](#backend-changes)).
- **Unit tests** (plain `node:test`, like the backend) for `dates.js` due-date parsing, labels and todo grouping, and `api.js` error mapping with a stubbed `fetch`.
- **Integration tests** with `@vscode/test-cli` against a stub HTTP server: commands registered, signing in from a stored token loads data, diary documents read and save, an empty day opens empty, Draft from GitHub fills an entry, and sign-out revokes and forgets the token.
- **Manual checklist before each release:** sign in on Windows, macOS and Linux; sign in from a Remote-SSH window and from a Codespace; write and save an entry, then see it in the dashboard; add a todo with a time, wait for the notification and the email; revoke from the dashboard and see the extension drop to signed-out.
- **CI:** a new `extension` job in `.github/workflows/ci.yml` that runs lint, unit tests and integration tests (under `xvfb-run` on Ubuntu).

## Packaging and publishing

- **Tooling:** `@vscode/vsce` for the VS Code Marketplace and `ovsx` for [Open VSX](https://open-vsx.org) (used by VSCodium, Cursor, Gitpod and others).
- **Publisher:** create a publisher on the [Marketplace management page](https://marketplace.visualstudio.com/manage) and an Azure DevOps personal access token with *Marketplace → Manage* scope. Create an Open VSX namespace and token too.
- **Secrets:** add `VSCE_PAT` and `OVSX_PAT` as repository secrets. Until one is set, the release workflow skips publishing to that marketplace and only attaches the `.vsix` to the GitHub Release.
- **Versioning:** the extension has its own version in `vscode-extension/package.json` and its own tags, `ext-v0.1.0`, so it can ship independently of the backend's `v*` tags.
- **Release workflow:** `.github/workflows/release-extension.yml`, triggered by `ext-v*` tags. It runs CI, checks the tag matches the version in `package.json`, packages the `.vsix`, attaches it to a GitHub Release, and publishes with `vsce publish` and `ovsx publish`.
- **License:** the project has no license yet, so packaging uses `--skip-license`. Add a `LICENSE` before publishing to the Marketplace.
- **Marketplace page:** `vscode-extension/README.md` with screenshots of the three views, the diary editor and the sign-in page. Link the [privacy policy](../frontend/public/privacy.html) and state that the extension only talks to the configured DevDiary server.
- **Hosting dependency:** the extension is only useful to others once the backend is deployed publicly ([roadmap](./roadmap.md)). Until then, publish as a pre-release (`vsce publish --pre-release`) or share the `.vsix`.

## Build order

- [x] Backend: migration 3 (`api_tokens`, `auth_codes`)
- [x] Backend: bearer-token support in `requireAuth`
- [x] Backend: `/auth/vscode/*` sign-in flow and `/auth/tokens` routes, with tests
- [x] Backend: revoke API tokens in the uninstall webhook; clean up expired codes
- [x] Dashboard: **Connected editors** in Settings
- [x] Extension: scaffold `vscode-extension/`, manifest, launch config, lint
- [x] Extension: `api.js`, `auth.js` (sign in, sign out, paste-code fallback)
- [x] Extension: Todos view, todo commands, status bar
- [x] Extension: diary `FileSystemProvider`, Diary view, open-today and draft commands
- [x] Extension: Today view
- [x] Extension: due notifications
- [x] Tests and the CI `extension` job
- [x] Icon, README, CHANGELOG
- [x] Release workflow
- [x] Update [architecture.md](./architecture.md), [roadmap.md](./roadmap.md) and the project README
- [ ] Manual run on a real account: GitHub sign-in, the `vscode://` handoff, and the paste-code fallback
- [ ] Screenshots for the Marketplace README
- [ ] Add a `LICENSE`, create the publisher and tokens, tag `ext-v0.1.0`

## Open questions

- **Publisher ID.** Built as `krishmal2004` (extension ID `krishmal2004.devdiary2026`). If the Marketplace publisher ends up different, change `publisher` in `vscode-extension/package.json` and set `VSCODE_EXTENSION_ID` on the server.
- **Default `serverUrl`.** `http://localhost:4000` until there's a public deployment; change the default then.
- **License.** Needed before publishing to the Marketplace.
- **Display name.** "DevDiary" may already be taken on the Marketplace. Check before publishing.
- **Multiple accounts.** v1 supports one signed-in account per server. Switching accounts means signing out first.
