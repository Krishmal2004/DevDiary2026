# GitHub App Details

| Field | Value |
|---|---|
| App name | `DevDiary2026` |
| Owner | [@Krishmal2004](https://github.com/Krishmal2004) |
| App ID | `4993144` |
| Public page | https://github.com/apps/devdiary2026 |
| Homepage URL | https://github.com/Krishmal2004 *(placeholder until the app is deployed; then use the deployed URL)* |
| Callback URL | `http://localhost:4000/auth/github/callback` for local development. When you deploy, change it to `<BACKEND_BASE_URL>/auth/github/callback`. |
| Request user authorization (OAuth) during installation | On. Installing the app then signs the user in as well. |
| Setup URL | Leave empty. With the option above turned on, GitHub sends people to the callback URL after they install. |
| User token expiration | On (the default). The backend stores refresh tokens and renews access tokens automatically. |
| Installable on | Only on this account *(for now; switch to "Any account" when you release, see [release.md](./release.md))* |
| Webhook | Active, URL `<BACKEND_BASE_URL>/webhooks/github`, with a secret that matches `GITHUB_WEBHOOK_SECRET` |

## Permissions

| Permission | Access | Why |
|---|---|---|
| Repository → Metadata | Read-only | Required. Lists repositories. |
| Repository → Contents | Read-only | Commits and commit messages |
| Repository → Pull requests | Read-only | Open PRs, PRs you opened, reviews |
| Repository → Issues | Read-only | **Add this.** It's needed for the "Open issues" column on the Repositories page and for issues in diary drafts. Without it, the app still works but shows a note where issues would be. |

## Webhook events

Subscribe to **Installation**, **Installation repositories** and, if you list the app on Marketplace, **Marketplace purchase**. GitHub always sends **GitHub App authorization** events. When one arrives with `revoked`, the backend deletes that user's stored tokens.

## Seeing all repositories

The app only sees the repositories it's installed on. To load **all** of your repositories on the Repositories page, open **Add repositories** there, or go to https://github.com/apps/devdiary2026/installations/new, and pick **All repositories**. Do the same for each organization you want to include. Public activity on GitHub is visible regardless of installs.

Reminder emails go to the address set in the dashboard's Settings. On first sign-in the app fills it from your public GitHub profile email, if you have one.

## Credentials generated

Keep these private, never commit them to a repo:

- [x] Client ID
- [x] Client Secret
- [x] Private key (`.pem` file)
- [ ] Webhook secret (generate when you turn the webhook on)
