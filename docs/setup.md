# Setup / Getting Started

Requires Node.js 20 or newer.

```bash
# Clone the repo
git clone <your-repo-url>
cd devdiary2026

# Install dependencies for the backend and the frontend
npm run setup

# Copy the env template and fill in your credentials
cp backend/.env.example backend/.env

# Create or upgrade the SQLite database
npm run migrate

# Start the backend (port 4000) and the dashboard (port 5173) together
npm run dev
```

Then open http://localhost:5173 and sign in with GitHub.

Other scripts, all run from the repo root:

| Script | What it does |
|---|---|
| `npm test` | Runs the backend API test suite (in-memory database, GitHub and email stubbed) |
| `npm run lint` | Lints the frontend with oxlint |
| `npm run build` | Builds the dashboard into `frontend/dist` |
| `npm start` | Starts the backend in production mode; it also serves `frontend/dist` if it has been built |

## GitHub App settings

In the GitHub App settings (see [github-app.md](./github-app.md)), set the **Callback URL** to:

```
http://localhost:4000/auth/github/callback
```

This is `BACKEND_BASE_URL` + `/auth/github/callback`, so change it when you deploy.

## Environment Variables

All backend configuration lives in `backend/.env`:

| Variable | Required | Description |
|---|---|---|
| `PORT` | no | Backend port. Default `4000`. |
| `BACKEND_BASE_URL` | yes | Public URL of the backend. Used to build the OAuth callback URL. An `https://` value turns on secure cookies. |
| `APP_BASE_URL` | yes | URL of the dashboard. Users land here after signing in, and it's the allowed CORS origin. In production, when the backend serves the dashboard, it's the same as `BACKEND_BASE_URL`. |
| `GITHUB_APP_ID` | no | GitHub App ID (`4993144`). Only for reference; the user sign-in flow doesn't need it. |
| `GITHUB_CLIENT_ID` | yes | GitHub App client ID. |
| `GITHUB_CLIENT_SECRET` | yes | GitHub App client secret. |
| `GITHUB_PRIVATE_KEY_PATH` | no | Path to the app's `.pem` private key. Not used yet; it's only needed for installation-level API calls. |
| `GITHUB_APP_SLUG` | no | The app's URL name (`https://github.com/apps/<slug>`). Used for the "Add repositories" install link. Default `devdiary2026`. |
| `GITHUB_WEBHOOK_SECRET` | for webhooks | Secret shared with the GitHub App webhook. Without it, `/webhooks/github` returns 503. |
| `SESSION_SECRET` | yes | Long random string that signs session cookies. Generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. |
| `DATABASE_PATH` | no | SQLite file location. Default `./data/devdiary.sqlite`. |
| `EMAIL_PROVIDER` | no | `resend` (default) or `postmark`. |
| `EMAIL_API_KEY` | no | API key for the email provider. **If it's unset, reminder emails are printed to the backend console instead of sent.** |
| `EMAIL_FROM` | with a key | Sender address. It must be verified with your email provider. |
| `REMINDER_CRON` | no | How often to check for due todos, in cron syntax. Default `* * * * *` (every minute). |
| `DISABLE_SCHEDULER` | no | Set to `true` to turn off the reminder job, for example on extra instances. |

The frontend needs no configuration in development: Vite proxies `/api` and `/auth` to `http://localhost:4000`. You only need to set `VITE_API_BASE_URL` in `frontend/.env` if you host the API on a different origin than the dashboard.

> ⚠️ Never commit `.env` or the `.pem` private key file to version control. Both are already listed in `.gitignore`.

## Deploying

The included `Dockerfile` builds the dashboard and runs the backend, which serves both the API and the dashboard on one origin:

```bash
docker build -t devdiary2026 .
docker run -p 4000:4000 --env-file backend/.env -v devdiary-data:/app/backend/data devdiary2026
```

On Render, Railway or Fly.io:

1. Deploy from the Dockerfile and attach a persistent volume at `/app/backend/data`.
2. Set `BACKEND_BASE_URL` and `APP_BASE_URL` to the public `https://` URL.
3. Update the GitHub App's callback URL to `<that URL>/auth/github/callback`.
4. Run a single instance. The SQLite database and the in-process reminder scheduler both assume one server.
