# Architecture

## Problem

GitHub is built around repos, issues, and team-level project management. It has nothing for the **individual developer's own daily work life**:

- No simple place to log "what I worked on today"
- No personal todos/planning that don't require a repo, issue, or project board
- No reminders on a schedule you set — GitHub only notifies you on *activity* (a comment, an assignment), never at a *time* you choose
- No cross-repo view of your own personal activity and plans

Developers currently patch this together with disconnected tools (Notion, notebooks, generic to-do apps) that know nothing about their actual GitHub activity.

## How It Works

1. User signs in with GitHub (OAuth via the GitHub App)
2. Backend pulls the user's commits/PRs for the day via the GitHub API
3. User writes/edits a diary entry and/or adds todos with due dates
4. A scheduled job checks for due todos and sends an email reminder
5. User sees everything in a simple personal dashboard

## Tech Stack

| Layer | Choice |
|---|---|
| Auth | GitHub App user authorization (OAuth), signed cookie sessions |
| Backend | Node.js / Express (`backend/`) |
| Database | SQLite via better-sqlite3, with versioned migrations |
| Scheduler | node-cron, running inside the backend process |
| Email | Resend or Postmark over HTTPS; logs to the console when no key is set |
| Frontend | React + Vite dashboard (`frontend/`): calendar view for the diary, list view for todos |
| Hosting | One Docker container (Render / Railway / Fly.io) |

## Code layout

```
backend/src/
  index.js              starts the server and the reminder scheduler
  app.js                Express app: middleware, routes, serves frontend/dist in production
  validation.js         input validators (dates, URLs, emails, time zones)
  db/
    index.js            opens SQLite and applies pending migrations
    migrations.js       ordered schema migrations, tracked with PRAGMA user_version
    migrate.js          `npm run migrate` entry point
  middleware/
    requireAuth.js      loads req.user from the session, or returns 401
  routes/
    auth.js             GitHub sign-in, /auth/me profile and settings, logout
    diary.js            diary entries
    todos.js            todos
    github.js           daily activity pull and diary draft
  services/
    github.js           token exchange and refresh, GraphQL activity queries, markdown draft
    email.js            Resend / Postmark / console sender
    reminders.js        due-todo check and cron scheduling
backend/test/           API tests (node:test)

frontend/src/
  App.jsx               session bootstrap, sign-in screen, dashboard shell
  api.js                fetch wrapper for the backend
  dates.js              local-day and due-date helpers
  components/
    DiaryPanel.jsx      calendar plus editor, "Draft from GitHub activity", preview
    Calendar.jsx        month grid; days with an entry get a dot
    Markdown.jsx        small, safe markdown renderer for previews
    TodosPanel.jsx      add, edit, complete and delete todos; due and overdue badges
    SettingsDialog.jsx  reminder email, on/off switch, time zone
```

## Data model

| Table | Key columns |
|---|---|
| `users` | `github_id`, `username`, `avatar_url`, `email`, `reminders_enabled`, `timezone`, `access_token`, `refresh_token`, `token_expires_at` |
| `diary_entries` | `user_id`, `entry_date` (`YYYY-MM-DD`, one per user per day), `content` (markdown) |
| `todos` | `user_id`, `title`, `due_date` (UTC ISO timestamp, or `YYYY-MM-DD` for all-day), `done`, `linked_url`, `reminder_sent_at` |

## API

Every route except `/health` and the sign-in routes needs a signed-in session. Each user can only see and change their own data.

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness check |
| GET | `/auth/github` | Starts GitHub sign-in |
| GET | `/auth/github/callback` | OAuth callback. Stores tokens and redirects to `APP_BASE_URL` |
| GET | `/auth/me` | Current user and their settings |
| PATCH | `/auth/me` | Updates `email`, `reminders_enabled` or `timezone` |
| POST | `/auth/logout` | Clears the session |
| GET | `/api/diary?from=&to=` | Entries in a date range (inclusive) |
| GET | `/api/diary/date/:date` | The entry for one day |
| POST | `/api/diary` | Creates the entry for `entry_date`, or replaces it if one exists |
| PUT / DELETE | `/api/diary/:id` | Updates or deletes an entry |
| GET / POST | `/api/todos` | Lists or creates todos |
| PUT / DELETE | `/api/todos/:id` | Updates (partial) or deletes a todo |
| GET | `/api/github/activity?date=&tzOffset=` | Commits, opened PRs and reviews for one local day, plus a markdown draft |

## How the pieces work

- **Activity pull.** A GraphQL `contributionsCollection` query between local midnight and midnight returns the PRs you opened, the reviews you gave, and a per-repo commit count. A second query fetches your commit messages from each repo's default branch. The app only sees private repos where the GitHub App is installed.
- **Token refresh.** GitHub App user tokens expire after 8 hours. The backend stores the refresh token and swaps it for a new access token before calling GitHub. If GitHub still rejects the token, the dashboard asks you to sign in again.
- **Reminders.** Every minute (`REMINDER_CRON`), the scheduler finds open todos that are past due, not yet reminded, and belong to users with reminders on and an email set. It sends each user one email listing those todos, then sets `reminder_sent_at`. Moving a todo's due date clears `reminder_sent_at`, so the reminder fires again. If sending fails, the todo stays unmarked and the next run retries.
- **Email address.** Without the "Email addresses" permission, the app can only read your public GitHub email. You can set or change the reminder email in Settings.

## Features

### v1 (MVP)
- **Daily Diary** — log what you worked on each day, auto-drafted from that day's commits/PRs across all your repos
- **Personal Todos** — plans and tasks that exist independently of any repo, optionally linkable to an issue/PR
- **Email Reminders** — get emailed when a todo is due

### Planned (post-MVP)
- Weekly auto-summary email of commits/PRs across all repos
- Personal goal tracking with progress pulled from linked PRs
- Consistency/streak view of coding activity
- Cross-repo personal dashboard
