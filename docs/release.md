# Releasing DevDiary2026 as a public GitHub App

This checklist takes DevDiary2026 from a private app on one account to one anyone can install, and optionally lists it on GitHub Marketplace. Steps marked 🧑 are done by the app owner in the GitHub or hosting UI. Everything else is already in the repo.

## 1. Ship a versioned build

Pushing a version tag runs [`release.yml`](../.github/workflows/release.yml). It runs the full CI suite, publishes `ghcr.io/krishmal2004/devdiary2026:<version>`, and creates a GitHub Release with generated notes.

```bash
git tag v1.0.0
git push origin v1.0.0
```

🧑 After the first publish, make the package public if you want others to self-host: open the repo's **Packages** tab → the package → **Package settings** → **Change visibility**.

## 2. Deploy it

🧑 Deploy the image, or the Dockerfile, to Render, Railway or Fly.io by following [setup.md → Deploying](./setup.md#deploying). You'll need:

- A persistent volume at `/app/backend/data`
- `BACKEND_BASE_URL` and `APP_BASE_URL` both set to the public `https://` URL
- `GITHUB_WEBHOOK_SECRET`, plus a real `EMAIL_API_KEY` and a verified `EMAIL_FROM`

Check that `https://<your-domain>/health` returns `{"status":"ok"}`, and that `/privacy.html` and `/terms.html` load.

## 3. Update the GitHub App settings

🧑 At https://github.com/settings/apps/devdiary2026:

| Setting | Value |
|---|---|
| Homepage URL | `https://<your-domain>` |
| Callback URL | `https://<your-domain>/auth/github/callback` |
| Request user authorization (OAuth) during installation | ✅ |
| Webhook | Active · URL `https://<your-domain>/webhooks/github` · secret = `GITHUB_WEBHOOK_SECRET` |
| Permissions | Add **Issues: Read-only** (see [github-app.md](./github-app.md#permissions)) |
| Subscribe to events | Installation, Installation repositories |
| Where can this GitHub App be installed? | **Any account** (Advanced → Make public) |

When you add a permission, existing installations have to approve it. GitHub prompts their owners.

Now anyone can install the app at **https://github.com/apps/devdiary2026**.

## 4. (Optional) List it on GitHub Marketplace

🧑 Go to https://github.com/marketplace/new, choose DevDiary2026, and fill in the listing:

| Listing field | Suggested content |
|---|---|
| Name | DevDiary2026 |
| Very short description | Personal dev diary, todos and reminders alongside GitHub |
| Categories | Productivity, Project management |
| Introductory description | Your daily work log, drafted from your commits and PRs across every repo, plus personal todos with email reminders. |
| Privacy policy URL | `https://<your-domain>/privacy.html` |
| Terms of service URL | `https://<your-domain>/terms.html` |
| Support URL | https://github.com/Krishmal2004/DevDiary2026/issues |
| Logo and screenshots | A logo (at least 200×200) and screenshots of the dashboard and the Repositories page |
| Pricing plan | Free |

Before you submit, check GitHub's current Marketplace requirements. For example, verified listings and paid plans need a verified organization and a Marketplace webhook. Free listings are the simplest path. The backend already accepts and logs `marketplace_purchase` events.

## 5. After launch

- Watch the backend logs for `installation` and `marketplace_purchase` events.
- The app runs as one instance with SQLite. If usage grows, move to PostgreSQL and a separate scheduler before running more than one instance.
- Rotate `SESSION_SECRET`, the client secret and the webhook secret if any of them leaks.
