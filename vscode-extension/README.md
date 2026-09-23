# DevDiary for VS Code

Your [DevDiary2026](https://github.com/Krishmal2004/DevDiary2026) work log inside the editor: write today's diary entry, draft it from your GitHub activity, and keep track of personal todos without switching to the browser.

## Features

- **Today** — today's commits (by repository), pull requests, issues and reviews. Click any item to open it on GitHub.
- **Todos** — your personal todos grouped by *Overdue*, *Today*, *Upcoming* and *No date*. Add, rename, reschedule, complete and delete them from the sidebar or the Command Palette.
- **Diary** — today's entry and your recent ones. Entries open as normal Markdown documents, so you get highlighting, preview (`Ctrl+Shift+V`) and your Markdown extensions. Saving the document saves the entry.
- **Draft from GitHub** — fill an entry with a Markdown summary of that day's activity, then add your own notes.
- **Due reminders** — a status bar count of overdue and due-today todos, and a notification when a todo becomes due (with *Mark Done* and *Snooze 1 Hour*).

## Getting started

1. You need a DevDiary2026 server: a public instance or your own ([setup guide](https://github.com/Krishmal2004/DevDiary2026/blob/main/docs/setup.md)).
2. Set **DevDiary: Server Url** (`devdiary.serverUrl`) to its address. The default is `http://localhost:4000` for local development.
3. Open the **DevDiary** view in the activity bar and choose **Sign in with GitHub**.
4. Your browser opens. Sign in with GitHub if asked, then choose **Allow**. The browser hands you back to VS Code and you're signed in.

If your browser can't open VS Code (for example in a browser-based editor), the page shows a one-time code. Run **DevDiary: Paste Sign-In Code** and paste it.

## Commands

| Command | Keybinding |
|---|---|
| DevDiary: Open Today's Diary | `Ctrl+Alt+D` / `Cmd+Alt+D` |
| DevDiary: Add Todo | `Ctrl+Alt+T` / `Cmd+Alt+T` |
| DevDiary: Open Diary for Date… | |
| DevDiary: Draft Diary from GitHub | |
| DevDiary: Mark Todo Done / Reopen, Edit Todo Title, Set Todo Due Date, Delete Todo | |
| DevDiary: Refresh | |
| DevDiary: Sign In with GitHub / Sign Out / Paste Sign-In Code | |
| DevDiary: Open Dashboard | |

Due dates can be *No due date*, *Today*, *Tomorrow*, *Next Monday*, *In a week*, or a custom `YYYY-MM-DD` (all day) or `YYYY-MM-DD HH:mm` (local time).

## Settings

| Setting | Default | Description |
|---|---|---|
| `devdiary.serverUrl` | `http://localhost:4000` | DevDiary backend to use. Each server keeps its own sign-in. |
| `devdiary.refreshInterval` | `5` | Minutes between background refreshes |
| `devdiary.notifications.dueTodos` | `true` | Notify when a todo becomes due |
| `devdiary.statusBar.enabled` | `true` | Show the due-todo count in the status bar |
| `devdiary.diary.draftMode` | `ask` | When drafting into an entry that has text: `ask`, `append` or `replace` |

## Privacy and security

- The extension only talks to the DevDiary server you configure. It never sees your GitHub token; the server keeps that.
- Signing in gives the extension a DevDiary API token, stored in VS Code's secret storage (your OS keychain). Sign-in uses PKCE, so a code intercepted on its way back to VS Code can't be used by anyone else.
- **Sign Out** revokes the token on the server. You can also revoke it from the dashboard under **Settings → Connected editors**. Uninstalling the DevDiary GitHub App revokes it too.
- See the [privacy policy](https://github.com/Krishmal2004/DevDiary2026/blob/main/frontend/public/privacy.html).
