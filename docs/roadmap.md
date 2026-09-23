# Build Order / Roadmap

- [x] Register GitHub App and generate credentials
- [x] Backend: GitHub OAuth login flow (with automatic user-token refresh)
- [x] Backend: pull commits/PRs for the logged-in user
- [x] Backend: diary entry storage (per user, one entry per day)
- [x] Backend: todo storage with due dates (per user)
- [x] Backend: scheduled job + email reminders
- [x] Frontend: dashboard (diary view + todo view)
- [x] Automated end-to-end API tests (`npm test`) and CI on every push
- [x] Repositories page: all installed repositories with their commits, PRs and issues
- [x] Release readiness: webhook receiver, privacy and terms pages, tag-triggered release workflow ([release.md](./release.md))
- [ ] Test end-to-end on personal account (sign in, draft a diary entry from real activity, receive a reminder email)
- [ ] Deploy to a public host (the Dockerfile is ready; see [setup.md](./setup.md#deploying))
- [ ] Make the GitHub App public ("Any account")
- [ ] Submit to GitHub Marketplace (optional)

## Post-MVP

- [ ] Weekly auto-summary email of commits/PRs across all repos
- [ ] Personal goal tracking with progress pulled from linked PRs
- [x] Consistency/streak view of coding activity (contribution graph, coding and writing streaks)
- [ ] Cross-repo personal dashboard

## Status

✅ MVP feature-complete and ready to release. GitHub sign-in, a diary drafted from your commits/PRs/issues, a Repositories page, personal todos and email reminders all work locally. Still to do: a manual run on a real account, then deploying and making the app public by following [release.md](./release.md).
