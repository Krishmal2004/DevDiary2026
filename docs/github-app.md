# GitHub App Details

| Field | Value |
|---|---|
| App name | `DevDiary2026` |
| Owner | [@Krishmal2004](https://github.com/Krishmal2004) |
| App ID | `4993144` |
| Homepage URL | https://github.com/Krishmal2004 *(placeholder until a real site is deployed)* |
| Installable on | Only on this account *(for now — switch to "Any account" before public launch)* |
| Webhook | Inactive *(not needed for MVP — data is pulled via polling, not events)* |
| Repository permissions | Contents: Read-only · Pull requests: Read-only · Metadata: Read-only |

| Callback URL | `http://localhost:4000/auth/github/callback` for local development. Change it to `<BACKEND_BASE_URL>/auth/github/callback` when you deploy. |
| User token expiration | On (the default). The backend stores refresh tokens and renews access tokens automatically. |

The dashboard reads commits and PRs with the signed-in user's token, so it can only see **private** repositories where the app is installed. Public activity is visible everywhere. To include more private repos, install the app on them from the app's settings page.

Reminder emails go to the address set in the dashboard's Settings. On first sign-in the app fills it from your public GitHub profile email, if you have one. Adding the *Email addresses: Read-only* account permission would let the app read your private primary email, but this isn't needed.

## Credentials generated

Keep these private, never commit them to a repo:

- [x] Client ID
- [x] Client Secret
- [x] Private key (`.pem` file)
