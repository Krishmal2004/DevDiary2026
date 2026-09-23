# DevDiary2026 — Dashboard

This is the React + Vite dashboard for DevDiary2026. It has:

- **Diary**: a month calendar and a markdown editor for each day. "Draft from GitHub activity" pulls that day's commits, PRs and reviews into the entry.
- **Todos**: personal tasks with optional due times and links to issues or PRs. Overdue todos are highlighted, and you get an email reminder when one is due.
- **Settings**: your reminder email, a switch to turn reminders on or off, and your time zone.

Start it from the repo root with `npm run dev`, which also starts the backend. You can also run `npm run dev` in this folder once the backend is running on port 4000. Vite proxies `/api` and `/auth` to the backend, so no configuration is needed.

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server on http://localhost:5173 |
| `npm run build` | Production build into `dist/`, which the backend serves |
| `npm run lint` | oxlint |

See [../docs/architecture.md](../docs/architecture.md) for how it fits together.
