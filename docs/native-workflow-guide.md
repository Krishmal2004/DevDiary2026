# Native GitHub Workflow Guide: Personal Dev Diary (No App Required)

This guide documents a **fully working workaround** for personal dev-diary tracking, todos, and reminders using only native GitHub features — no third-party app, no DevDiary2026 backend required. It's written up for the GitHub Community Discussion thread on this topic (see the two workaround replies from the community that this guide expands into a complete, runnable implementation).

> If you just want the finished product instead of the DIY setup, DevDiary2026 (this repo) is building a hosted version of this exact workflow. See [architecture.md](./architecture.md).

---

## Table of Contents

- [Why this is needed](#why-this-is-needed)
- [What you'll end up with](#what-youll-end-up-with)
- [Prerequisites](#prerequisites)
- [Step 1 — Create the diary repo](#step-1--create-the-diary-repo)
- [Step 2 — Personal todos with GitHub Projects v2](#step-2--personal-todos-with-github-projects-v2)
- [Step 3 — Auto-generate a daily diary entry with GitHub Actions](#step-3--auto-generate-a-daily-diary-entry-with-github-actions)
- [Step 4 — Scheduled reminders](#step-4--scheduled-reminders)
- [Step 5 — Quick capture with Gists](#step-5--quick-capture-with-gists)
- [Step 6 — Surface it on your profile](#step-6--surface-it-on-your-profile)
- [Full workflow diagram](#full-workflow-diagram)
- [Known limitations](#known-limitations)

---

## Why this is needed

GitHub has no native concept of a **personal, repo-independent** log or reminder:

- Issues and Projects (classic) require a repository or org.
- Notifications fire on *events* (mentions, assignments, comments) — never on a *schedule you choose*.
- There's no "just write a note to future-me" surface that isn't a repo file.

This guide stitches together four native features — a private repo, Projects v2 (user-scoped), Actions (scheduled), and Gists — into one workflow that covers diary + todos + reminders without hosting anything yourself.

## What you'll end up with

| Need | Native feature used |
|---|---|
| Daily diary auto-drafted from your GitHub activity | Private repo + scheduled Actions workflow + GraphQL API |
| Personal todos not tied to any repo | User-scoped GitHub Projects v2 (draft issues) |
| Reminders on a schedule | Scheduled Actions workflow → Issue (or email via an Actions mail step) |
| Fast, unstructured notes | GitHub Gists |
| One place to find it all | Pinned link in your profile README |

## Prerequisites

- [GitHub CLI](https://cli.github.com/) (`gh`) installed and authenticated: `gh auth login`
- A **Personal Access Token (classic)** with scopes: `repo`, `read:user`, `project`
  Create one at `https://github.com/settings/tokens`, then add it as a repository secret named `PERSONAL_ACCESS_TOKEN` (Settings → Secrets and variables → Actions → New repository secret). The default `GITHUB_TOKEN` cannot read your cross-repo contribution data or write to Projects v2, so a PAT is required here.

---

## Step 1 — Create the diary repo

A **private** repo is the canonical store everything else in this guide writes to.

```bash
gh repo create dev-diary --private --description "Personal dev diary + logs"
cd dev-diary
mkdir log
echo "# Dev Diary" > README.md
git add . && git commit -m "init" && git push -u origin main
```

Each day's entry lives at `log/YYYY-MM-DD.md`. Keeping entries as one file per day (rather than one growing file) keeps diffs small and makes the repo easy to grep or turn into a static site later.

## Step 2 — Personal todos with GitHub Projects v2

User-scoped Projects don't require a repository, so draft items stay purely personal.

1. Go to `https://github.com/users/YOUR_USERNAME/projects` → **New project**.
2. Add custom fields for `Due Date` (date), `Category` (single select), `Status` (Todo / In Progress / Done).
3. Add tasks via **+ Add item → Draft issue** — these live only on the board, not in any repo.
4. If a draft task turns into real work, convert it to a repo issue in one click from the `…` menu on the card — it keeps the same project fields.

Optional CLI equivalent for scripting item creation:

```bash
gh project item-create <project-number> --owner YOUR_USERNAME --title "Write Q3 retro"
```

## Step 3 — Auto-generate a daily diary entry with GitHub Actions

This is the core automation: a scheduled workflow in the `dev-diary` repo pulls your cross-repo commit and PR activity for the day via the GraphQL API and commits it as that day's entry.

Create `.github/workflows/daily-diary.yml`:

```yaml
name: Daily Activity Diary

on:
  schedule:
    - cron: '0 20 * * *'   # 8 PM UTC daily — adjust to your timezone
  workflow_dispatch:        # allows manual "Run workflow" from the Actions tab

jobs:
  generate-diary:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - name: Checkout diary repo
        uses: actions/checkout@v4

      - name: Generate daily summary
        env:
          GH_TOKEN: ${{ secrets.PERSONAL_ACCESS_TOKEN }}
        run: |
          DATE=$(date +'%Y-%m-%d')
          mkdir -p log
          echo "## Activity Log for $DATE" > "log/$DATE.md"
          echo "" >> "log/$DATE.md"

          gh api graphql -f query='
            query {
              viewer {
                contributionsCollection {
                  pullRequestContributions(first: 10) {
                    nodes {
                      pullRequest { title url repository { nameWithOwner } }
                    }
                  }
                  commitContributionsByRepository {
                    repository { nameWithOwner }
                    contributions { totalCount }
                  }
                }
              }
            }' --jq '
              "### Pull Requests\n" +
              ((.data.viewer.contributionsCollection.pullRequestContributions.nodes
                | map("- [" + .pullRequest.title + "](" + .pullRequest.url + ") — " + .pullRequest.repository.nameWithOwner)
                | join("\n")) // "- none") +
              "\n\n### Commits\n" +
              ((.data.viewer.contributionsCollection.commitContributionsByRepository
                | map("- " + .repository.nameWithOwner + ": " + (.contributions.totalCount | tostring) + " commits")
                | join("\n")) // "- none")
            ' >> "log/$DATE.md"

          echo "" >> "log/$DATE.md"
          echo "### Notes" >> "log/$DATE.md"
          echo "_(add your own reflections here)_" >> "log/$DATE.md"

      - name: Commit diary entry
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add log/
          git commit -m "diary: $(date +'%Y-%m-%d')" || echo "No changes to commit"
          git push
```

Notes on this workflow:

- `workflow_dispatch` lets you trigger it manually from the Actions tab to test before waiting for the cron.
- The `--jq` filter turns the GraphQL response directly into markdown, so no extra scripting language is needed.
- The commit step no-ops gracefully (`|| echo`) on days with zero activity instead of failing the run.
- Cron times are UTC — convert your local end-of-day time before setting the schedule.

## Step 4 — Scheduled reminders

GitHub only notifies on events, so a scheduled workflow has to *create* an event. The simplest approach: have a workflow open (or comment on) a tracking Issue for todos that are due, which triggers a normal GitHub notification since you're watching the repo.

Create `.github/workflows/due-reminders.yml`:

```yaml
name: Due Todo Reminders

on:
  schedule:
    - cron: '0 8 * * *'   # 8 AM UTC daily
  workflow_dispatch:

jobs:
  remind:
    runs-on: ubuntu-latest
    permissions:
      issues: write
    steps:
      - name: Open reminder issue
        env:
          GH_TOKEN: ${{ secrets.PERSONAL_ACCESS_TOKEN }}
        run: |
          gh issue create \
            --repo YOUR_USERNAME/dev-diary \
            --title "Reminder: check today's due todos ($(date +'%Y-%m-%d'))" \
            --body "Auto-generated reminder. Check your Projects board for items due today."
```

If you want an actual **email** rather than a GitHub notification, add a mail step using a community action such as [`dawidd6/action-send-mail`](https://github.com/dawidd6/action-send-mail), with SMTP credentials stored as repo secrets:

```yaml
      - name: Send email reminder
        uses: dawidd6/action-send-mail@v3
        with:
          server_address: smtp.gmail.com
          server_port: 465
          username: ${{ secrets.SMTP_USERNAME }}
          password: ${{ secrets.SMTP_PASSWORD }}
          subject: "Dev diary reminder — todos due today"
          to: you@example.com
          from: Dev Diary Bot
          body: "Check your Projects board for items due today."
```

## Step 5 — Quick capture with Gists

For a note you don't want to structure into the diary repo immediately:

```bash
gh gist create --public=false -d "quick note $(date +%Y-%m-%d)" note.md
```

Gists are searchable from `https://gist.github.com/YOUR_USERNAME` and can be triaged into `dev-diary` later.

## Step 6 — Surface it on your profile

Pin the diary repo link (and optionally the Projects board) in your profile README (`YOUR_USERNAME/YOUR_USERNAME` repo) so it's one click away from your GitHub homepage:

```markdown
## 📓 Dev Diary
Daily activity log, auto-generated: [dev-diary](https://github.com/YOUR_USERNAME/dev-diary)
Personal todos: [Project board](https://github.com/users/YOUR_USERNAME/projects/N)
```

---

## Full workflow diagram

```
 ┌────────────────────┐        cron 08:00 UTC        ┌───────────────────────┐
 │  due-reminders.yml  │ ────────────────────────────▶│ Issue opened/commented │──▶ GitHub notification
 └────────────────────┘                               └───────────────────────┘

 ┌────────────────────┐        cron 20:00 UTC        ┌───────────────────────┐
 │  daily-diary.yml    │ ────GraphQL(contributions)──▶│  log/YYYY-MM-DD.md    │──▶ committed & pushed
 └────────────────────┘                               └───────────────────────┘

 ┌───────────────────────────┐            ┌────────────────────────────┐
 │ Projects v2 (user-scoped) │◀──add/edit─│ you, manually, any time    │
 │ draft issues = todos      │            └────────────────────────────┘
 └───────────────────────────┘

 ┌──────────┐
 │ Gists    │◀── ad-hoc quick notes, triaged into dev-diary later
 └──────────┘

 profile README ──▶ links to all of the above
```

## Known limitations

This setup closes the gap, but it's still a workaround, not a purpose-built tool:

- **No enforced schedule accuracy** — Actions cron can be delayed by minutes under GitHub-wide load; not suitable for time-critical reminders.
- **PAT management** — a classic PAT with `repo`+`project` scope is broad; rotate it periodically and never log its value in workflow output.
- **No rich UI** — everything is markdown files, Issues, and the Projects board UI; no calendar view, streaks, or cross-repo dashboard.
- **Reminders are notifications, not emails**, unless you add a separate SMTP-based Actions step (Step 4).

These are exactly the gaps [DevDiary2026](../README.md) aims to remove with a dedicated backend, scheduler, and dashboard — see [roadmap.md](./roadmap.md) for build status. Until then, this guide is a complete, working substitute using only what GitHub already offers.
