const cron = require("node-cron");
const db = require("../db");
const { sendEmail } = require("./email");

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDue(dueDate, timeZone) {
  // Date-only values are all-day todos; show them without a time.
  if (/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return dueDate;
  try {
    return new Date(dueDate).toLocaleString("en-US", {
      timeZone: timeZone || "UTC",
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return new Date(dueDate).toUTCString();
  }
}

function buildReminderEmail(user, todos) {
  const appUrl = process.env.APP_BASE_URL || "http://localhost:5173";
  const subject =
    todos.length === 1 ? `Reminder: ${todos[0].title}` : `Reminder: ${todos.length} todos are due`;

  const text = [
    `Hi ${user.username},`,
    "",
    "These DevDiary2026 todos are due:",
    ...todos.map((t) => `- ${t.title} (due ${formatDue(t.due_date, user.timezone)})${t.linked_url ? ` ${t.linked_url}` : ""}`),
    "",
    `Open your dashboard: ${appUrl}`,
  ].join("\n");

  const items = todos
    .map((t) => {
      const title = t.linked_url
        ? `<a href="${escapeHtml(t.linked_url)}">${escapeHtml(t.title)}</a>`
        : escapeHtml(t.title);
      return `<li>${title} <span style="color:#666">— due ${escapeHtml(formatDue(t.due_date, user.timezone))}</span></li>`;
    })
    .join("");
  const html = `
    <p>Hi ${escapeHtml(user.username)},</p>
    <p>These DevDiary2026 todos are due:</p>
    <ul>${items}</ul>
    <p><a href="${escapeHtml(appUrl)}">Open your dashboard</a></p>`;

  return { to: user.email, subject, text, html };
}

// Emails every user whose open todos have come due and haven't been
// reminded yet, then marks those todos as reminded. Safe to run repeatedly.
async function runReminderCheck(now = new Date()) {
  const due = db
    .prepare(
      `SELECT t.*, u.username, u.email, u.timezone
       FROM todos t
       JOIN users u ON u.id = t.user_id
       WHERE t.done = 0
         AND t.reminder_sent_at IS NULL
         AND t.due_date IS NOT NULL
         AND t.due_date <= ?
         AND u.reminders_enabled = 1
         AND u.email IS NOT NULL AND u.email != ''
       ORDER BY t.user_id, t.due_date`
    )
    .all(now.toISOString());

  const byUser = new Map();
  for (const todo of due) {
    if (!byUser.has(todo.user_id)) {
      byUser.set(todo.user_id, {
        user: { username: todo.username, email: todo.email, timezone: todo.timezone },
        todos: [],
      });
    }
    byUser.get(todo.user_id).todos.push(todo);
  }

  const markSent = db.prepare(
    "UPDATE todos SET reminder_sent_at = ? WHERE id = ? AND reminder_sent_at IS NULL"
  );
  let sent = 0;
  for (const { user, todos } of byUser.values()) {
    try {
      await sendEmail(buildReminderEmail(user, todos));
      const sentAt = new Date().toISOString();
      db.transaction(() => todos.forEach((t) => markSent.run(sentAt, t.id)))();
      sent += todos.length;
    } catch (err) {
      // Leave reminder_sent_at unset so the next run retries.
      console.error(`Failed to send reminder to user ${user.username}:`, err.message);
    }
  }
  return { remindersSent: sent, usersNotified: byUser.size };
}

function startReminderScheduler() {
  const schedule = process.env.REMINDER_CRON || "* * * * *";
  if (!cron.validate(schedule)) {
    throw new Error(`Invalid REMINDER_CRON expression: "${schedule}"`);
  }
  let running = false;
  const task = cron.schedule(schedule, async () => {
    if (running) return;
    running = true;
    try {
      const result = await runReminderCheck();
      if (result.remindersSent > 0) {
        console.log(`Sent ${result.remindersSent} reminder(s) to ${result.usersNotified} user(s)`);
      }
    } catch (err) {
      console.error("Reminder check failed:", err);
    } finally {
      running = false;
    }
  });
  console.log(`Reminder scheduler running on "${schedule}"`);
  return task;
}

module.exports = { runReminderCheck, startReminderScheduler, buildReminderEmail };
