// Date helpers. Diary dates are local calendar days ("YYYY-MM-DD"); todo due
// dates are either all-day ("YYYY-MM-DD") or UTC ISO timestamps.

const pad = (n) => String(n).padStart(2, "0");

export function toDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayKey() {
  return toDateKey(new Date());
}

export function parseDateKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function isAllDay(due) {
  return /^\d{4}-\d{2}-\d{2}$/.test(due);
}

// The moment a todo becomes due, in the viewer's local time. All-day todos
// are due at the start of their day.
export function dueMoment(due) {
  return isAllDay(due) ? parseDateKey(due) : new Date(due);
}

// Due date → value for <input type="datetime-local">.
export function toLocalInputValue(due) {
  const d = dueMoment(due);
  return `${toDateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatLongDate(key) {
  return parseDateKey(key).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDue(due) {
  const moment = dueMoment(due);
  const today = parseDateKey(todayKey());
  const dayDiff = Math.round((parseDateKey(toDateKey(moment)) - today) / 86_400_000);
  const dayLabel =
    dayDiff === 0
      ? "Today"
      : dayDiff === 1
        ? "Tomorrow"
        : dayDiff === -1
          ? "Yesterday"
          : moment.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (isAllDay(due)) return dayLabel;
  return `${dayLabel}, ${moment.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

export function monthRange(year, month) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  return { from: toDateKey(first), to: toDateKey(last) };
}
