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

See [docs/setup.md](./docs/setup.md) for environment variable details.

## Status

🚧 GitHub App registered — backend/frontend not yet built. See [docs/roadmap.md](./docs/roadmap.md).

## License

TBD
