# DevDiary2026

A personal work companion for developers that lives alongside GitHub — a daily diary of your commits/PRs, personal todos that aren't tied to any repo, and email reminders when they're due.

> GitHub has no built-in way to track your own personal work log, plan tasks independent of a repo, or get reminded at a time you choose. This app fills that gap.

---

## Table of Contents

- [Problem](#problem)
- [Documentation](#documentation)
- [Setup / Getting Started](#setup--getting-started)
- [Status](#status)

---

## Problem

GitHub is built around repos, issues, and team-level project management. It has nothing for the **individual developer's own daily work life**:

- No simple place to log "what I worked on today"
- No personal todos/planning that don't require a repo, issue, or project board
- No reminders on a schedule you set — GitHub only notifies you on *activity* (a comment, an assignment), never at a *time* you choose
- No cross-repo view of your own personal activity and plans

Developers currently patch this together with disconnected tools (Notion, notebooks, generic to-do apps) that know nothing about their actual GitHub activity.

## Documentation

See the [docs](./docs) folder for details:

- [Architecture](./docs/architecture.md) — features, how it works, tech stack
- [GitHub App](./docs/github-app.md) — GitHub App configuration and permissions
- [Setup](./docs/setup.md) — local development setup and environment variables
- [Roadmap](./docs/roadmap.md) — build order and project status
- [Release](./docs/release.md) — publishing DevDiary2026 as a public GitHub App / Marketplace listing
- [Native Workflow Guide](./docs/native-workflow-guide.md) — a full DIY implementation using only native GitHub features (no app required)

## Setup / Getting Started

Requires Node.js 20+.

```bash
# Clone the repo
git clone <your-repo-url>
cd devdiary2026

# Install backend + frontend dependencies
npm run setup

# Copy env template and fill in your GitHub App credentials
cp backend/.env.example backend/.env

# Create / upgrade the SQLite database
npm run migrate

# Start the backend (:4000) and the dashboard (:5173)
npm run dev
```

Open http://localhost:5173 and sign in with GitHub. Run the API tests with `npm test`.

See [docs/setup.md](./docs/setup.md) for environment variables and deployment.

## Status

✅ MVP complete: GitHub sign-in, a daily diary auto-drafted from your commits/PRs, personal todos, and email reminders. Next up: a live test on a real account and deployment. See [docs/roadmap.md](./docs/roadmap.md).

## License

TBD
