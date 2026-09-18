# DevDiary2026

A personal work companion for developers that lives alongside GitHub — a daily diary of your commits/PRs, personal todos that aren't tied to any repo, and email reminders when they're due.

> GitHub has no built-in way to track your own personal work log, plan tasks independent of a repo, or get reminded at a time you choose. This app fills that gap.

---

## Table of Contents

- [Problem](#problem)
- [Features](#features)
- [How It Works](#how-it-works)
- [Tech Stack](#tech-stack)
- [GitHub App Details](#github-app-details)
- [Setup / Getting Started](#setup--getting-started)
- [Environment Variables](#environment-variables)
- [Build Order / Roadmap](#build-order--roadmap)
- [Status](#status)

---

## Problem

GitHub is built around repos, issues, and team-level project management. It has nothing for the **individual developer's own daily work life**:

- No simple place to log "what I worked on today"
- No personal todos/planning that don't require a repo, issue, or project board
- No reminders on a schedule you set — GitHub only notifies you on *activity* (a comment, an assignment), never at a *time* you choose
- No cross-repo view of your own personal activity and plans

Developers currently patch this together with disconnected tools (Notion, notebooks, generic to-do apps) that know nothing about their actual GitHub activity.

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

## How It Works

1. User signs in with GitHub (OAuth via the GitHub App)
2. Backend pulls the user's commits/PRs for the day via the GitHub API
3. User writes/edits a diary entry and/or adds todos with due dates
4. A scheduled job checks for due todos and sends an email reminder
5. User sees everything in a simple personal dashboard

## Tech Stack

| Layer | Choice |
|---|---|
| Auth | GitHub App OAuth |
| Backend | Node.js / Express *(or your preferred stack)* |
| Database | PostgreSQL / SQLite (for early prototyping) |
| Scheduler | node-cron or a hosted queue (e.g. Trigger.dev) |
| Email | Resend / Postmark / SendGrid |
| Frontend | Simple web dashboard (calendar view for diary, list view for todos) |
| Hosting | Render / Railway / Fly.io |

## GitHub App Details

| Field | Value |
|---|---|
| App name | `DevDiary2026` |
| Owner | [@Krishmal2004](https://github.com/Krishmal2004) |
| App ID | `4993144` |
| Homepage URL | https://github.com/Krishmal2004 *(placeholder until a real site is deployed)* |
| Installable on | Only on this account *(for now — switch to "Any account" before public launch)* |
| Webhook | Inactive *(not needed for MVP — data is pulled via polling, not events)* |
| Repository permissions | Contents: Read-only Β· Pull requests: Read-only Β· Metadata: Read-only |

**Credentials generated (keep these private, never commit them to a repo):**
- [x] Client ID
- [x] Client Secret
- [x] Private key (`.pem` file)

## Setup / Getting Started

\`\`\`bash
# Clone the repo
git clone <your-repo-url>
cd devdiary2026

# Install dependencies
npm install

# Copy env template and fill in your credentials
cp .env.example .env

# Run database migrations (once DB is set up)
npm run migrate

# Start the dev server
npm run dev
\`\`\`

## Environment Variables

\`\`\`env
GITHUB_APP_ID=4993144
GITHUB_CLIENT_ID=your_client_id_here
GITHUB_CLIENT_SECRET=your_client_secret_here
GITHUB_PRIVATE_KEY_PATH=./keys/devdiary2026.private-key.pem

DATABASE_URL=postgres://user:password@localhost:5432/devdiary

EMAIL_API_KEY=your_email_provider_api_key
EMAIL_FROM=reminders@yourdomain.com

APP_BASE_URL=http://localhost:3000
\`\`\`

> ⚠️ Never commit `.env` or the `.pem` private key file to version control. Add both to `.gitignore`.

## Build Order / Roadmap

- [x] Register GitHub App and generate credentials
- [ ] Backend: GitHub OAuth login flow
- [ ] Backend: pull commits/PRs for the logged-in user
- [ ] Backend: diary entry storage (manual text first)
- [ ] Backend: todo storage with due dates
- [ ] Backend: scheduled job + email reminders
- [ ] Frontend: dashboard (diary view + todo view)
- [ ] Test end-to-end on personal account
- [ ] Deploy to a public host
- [ ] Submit to GitHub Marketplace (optional)

## Status

🚧 GitHub App registered — backend/frontend not yet built.

## License

TBD
