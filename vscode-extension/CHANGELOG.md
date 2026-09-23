# Changelog

## 0.1.1

- Uses the public DevDiary server (https://devdiary-czdtetawaufxere0.southeastasia-01.azurewebsites.net) by default, so the extension works right after installing. Set `devdiary.serverUrl` to use your own server.

## 0.1.0

First release.

- Sign in with GitHub through your DevDiary server (browser sign-in, token kept in VS Code's secret storage)
- **Today** view: today's commits, pull requests, issues and reviews
- **Todos** view: grouped by Overdue / Today / Upcoming / No date, with add, edit, due date, done and delete
- **Diary** view and diary entries as Markdown documents that save back to DevDiary
- **Draft Diary from GitHub** fills an entry from that day's activity
- Status bar count of due todos, and a notification when a todo becomes due
