// Local-date helpers. "Today" is always the editor machine's local date,
// matching what the dashboard does in the browser. No VS Code API here, so
// this module is unit-tested with plain node:test.

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function pad(n) {
  return String(n).padStart(2, "0");
}

// YYYY-MM-DD for a Date in local time.
function localDate(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Local midnight for a YYYY-MM-DD string.
function parseLocalDate(value) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function isValidDate(value) {
  if (typeof value !== "string" || !DATE_ONLY.test(value)) return false;
  return localDate(parseLocalDate(value)) === value;
}

function addDays(value, days) {
  const date = parseLocalDate(value);
  date.setDate(date.getDate() + days);
  return localDate(date);
}

// Minutes behind UTC for that local day, like Date#getTimezoneOffset().
// Taken at noon so a DST switch at midnight doesn't pick the wrong offset.
function tzOffset(value) {
  return new Date(`${value}T12:00:00`).getTimezoneOffset();
}

// "Wed 23 Sep", or "Wed 23 Sep 2025" outside the current year.
function formatDay(value, now = new Date()) {
  const date = parseLocalDate(value);
  const weekday = date.toLocaleDateString("en-GB", { weekday: "short" });
  const month = date.toLocaleDateString("en-GB", { month: "short" });
  const year = date.getFullYear() !== now.getFullYear() ? ` ${date.getFullYear()}` : "";
  return `${weekday} ${date.getDate()} ${month}${year}`;
}

function formatTime(date) {
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

// The local calendar day a todo is due on, or null.
function dueDay(dueDate) {
  if (!dueDate) return null;
  return DATE_ONLY.test(dueDate) ? dueDate : localDate(new Date(dueDate));
}

// Whether an open todo's due time has passed. All-day todos are due from
// the start of their local day.
function isDue(todo, now = new Date()) {
  if (todo.done || !todo.due_date) return false;
  if (DATE_ONLY.test(todo.due_date)) return todo.due_date <= localDate(now);
  return new Date(todo.due_date).getTime() <= now.getTime();
}

function isOverdue(todo, now = new Date()) {
  if (todo.done || !todo.due_date) return false;
  if (DATE_ONLY.test(todo.due_date)) return todo.due_date < localDate(now);
  return new Date(todo.due_date).getTime() < now.getTime();
}

// Splits todos into the groups shown in the Todos view. Open todos keep the
// API's order (by due date); done todos are most recently updated first.
function groupTodos(todos, now = new Date()) {
  const today = localDate(now);
  const groups = { overdue: [], today: [], upcoming: [], noDate: [], done: [] };
  for (const todo of todos) {
    if (todo.done) groups.done.push(todo);
    else if (!todo.due_date) groups.noDate.push(todo);
    else if (isOverdue(todo, now)) groups.overdue.push(todo);
    else if (dueDay(todo.due_date) === today) groups.today.push(todo);
    else groups.upcoming.push(todo);
  }
  groups.done.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  return groups;
}

// Open todos that are overdue or due today — the status bar count.
function countDue(todos, now = new Date()) {
  const today = localDate(now);
  return todos.filter((t) => !t.done && t.due_date && (isOverdue(t, now) || dueDay(t.due_date) === today)).length;
}

// Short label for a due date: "today", "tomorrow 14:00", "yesterday",
// "in 3 days", "3 days ago", "Mon 5 Oct".
function dueLabel(dueDate, now = new Date()) {
  if (!dueDate) return "";
  const day = dueDay(dueDate);
  const diff = Math.round((parseLocalDate(day) - parseLocalDate(localDate(now))) / DAY_MS);
  let label;
  if (diff === 0) label = "today";
  else if (diff === 1) label = "tomorrow";
  else if (diff === -1) label = "yesterday";
  else if (diff > 1 && diff < 7) label = `in ${diff} days`;
  else if (diff < -1 && diff > -7) label = `${-diff} days ago`;
  else label = formatDay(day, now);
  return DATE_ONLY.test(dueDate) ? label : `${label} ${formatTime(new Date(dueDate))}`;
}

// Parses what the user types for a due date: "YYYY-MM-DD" (all-day) or
// "YYYY-MM-DD HH:mm" (local time → UTC ISO, as the dashboard sends).
// Returns undefined if it can't be parsed.
function parseDueInput(text) {
  const value = String(text || "").trim();
  if (isValidDate(value)) return value;
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})$/.exec(value);
  if (!match || !isValidDate(match[1])) return undefined;
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  if (hours > 23 || minutes > 59) return undefined;
  const date = parseLocalDate(match[1]);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
}

// The next given weekday (0 = Sunday) after today.
function nextWeekday(weekday, now = new Date()) {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const ahead = (weekday - date.getDay() + 7) % 7 || 7;
  date.setDate(date.getDate() + ahead);
  return localDate(date);
}

// SQLite's datetime('now') is UTC without a zone marker.
function sqliteTime(value) {
  return value ? new Date(`${value.replace(" ", "T")}Z`) : null;
}

module.exports = {
  localDate,
  parseLocalDate,
  isValidDate,
  addDays,
  tzOffset,
  formatDay,
  dueDay,
  isDue,
  isOverdue,
  groupTodos,
  countDue,
  dueLabel,
  parseDueInput,
  nextWeekday,
  sqliteTime,
};
