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
| Auth | GitHub App OAuth |
| Backend | Node.js / Express *(or your preferred stack)* |
| Database | PostgreSQL / SQLite (for early prototyping) |
| Scheduler | node-cron or a hosted queue (e.g. Trigger.dev) |
| Email | Resend / Postmark / SendGrid |
| Frontend | Simple web dashboard (calendar view for diary, list view for todos) |
| Hosting | Render / Railway / Fly.io |

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
