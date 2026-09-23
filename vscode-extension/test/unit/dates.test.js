const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  localDate,
  isValidDate,
  addDays,
  isDue,
  isOverdue,
  groupTodos,
  countDue,
  dueLabel,
  parseDueInput,
  nextWeekday,
  sqliteTime,
} = require("../../src/dates");

// Wed 23 Sep 2026, 10:00 local time.
const now = new Date(2026, 8, 23, 10, 0);
const at = (h, m = 0, day = 23) => new Date(2026, 8, day, h, m).toISOString();

test("localDate and addDays work in local time", () => {
  assert.equal(localDate(now), "2026-09-23");
  assert.equal(addDays("2026-09-30", 1), "2026-10-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});

test("isValidDate rejects impossible dates", () => {
  assert.equal(isValidDate("2026-09-23"), true);
  assert.equal(isValidDate("2026-02-30"), false);
  assert.equal(isValidDate("23-09-2026"), false);
  assert.equal(isValidDate(undefined), false);
});

test("all-day todos are due from the start of their day; timed ones at their time", () => {
  assert.equal(isDue({ due_date: "2026-09-23", done: 0 }, now), true);
  assert.equal(isOverdue({ due_date: "2026-09-23", done: 0 }, now), false);
  assert.equal(isOverdue({ due_date: "2026-09-22", done: 0 }, now), true);
  assert.equal(isDue({ due_date: at(9), done: 0 }, now), true);
  assert.equal(isDue({ due_date: at(11), done: 0 }, now), false);
  assert.equal(isDue({ due_date: at(9), done: 1 }, now), false);
  assert.equal(isDue({ due_date: null, done: 0 }, now), false);
});

test("todos are grouped into overdue, today, upcoming, no date and done", () => {
  const todos = [
    { id: 1, due_date: "2026-09-20", done: 0 },
    { id: 2, due_date: at(9), done: 0 },
    { id: 3, due_date: at(15), done: 0 },
    { id: 4, due_date: "2026-09-23", done: 0 },
    { id: 5, due_date: "2026-09-24", done: 0 },
    { id: 6, due_date: null, done: 0 },
    { id: 7, due_date: null, done: 1, updated_at: "2026-09-20 10:00:00" },
    { id: 8, due_date: "2026-09-01", done: 1, updated_at: "2026-09-22 10:00:00" },
  ];
  const groups = groupTodos(todos, now);
  const ids = (list) => list.map((t) => t.id);
  assert.deepEqual(ids(groups.overdue), [1, 2]);
  assert.deepEqual(ids(groups.today), [3, 4]);
  assert.deepEqual(ids(groups.upcoming), [5]);
  assert.deepEqual(ids(groups.noDate), [6]);
  assert.deepEqual(ids(groups.done), [8, 7]);
  assert.equal(countDue(todos, now), 4);
});

test("due labels are relative near today and dated further out", () => {
  assert.equal(dueLabel("2026-09-23", now), "today");
  assert.equal(dueLabel("2026-09-24", now), "tomorrow");
  assert.equal(dueLabel("2026-09-22", now), "yesterday");
  assert.equal(dueLabel("2026-09-26", now), "in 3 days");
  assert.equal(dueLabel("2026-09-20", now), "3 days ago");
  assert.equal(dueLabel("2026-10-05", now), "Mon 5 Oct");
  assert.equal(dueLabel("2027-01-04", now), "Mon 4 Jan 2027");
  assert.match(dueLabel(at(15), now), /^today \S+/);
});

test("due-date input accepts a date or a local date and time", () => {
  assert.equal(parseDueInput("2026-09-30"), "2026-09-30");
  assert.equal(parseDueInput(" 2026-09-30 17:30 "), new Date(2026, 8, 30, 17, 30).toISOString());
  assert.equal(parseDueInput("2026-09-30T08:05"), new Date(2026, 8, 30, 8, 5).toISOString());
  assert.equal(parseDueInput("2026-09-31"), undefined);
  assert.equal(parseDueInput("2026-09-30 25:00"), undefined);
  assert.equal(parseDueInput("tomorrow"), undefined);
});

test("nextWeekday is always in the future", () => {
  assert.equal(nextWeekday(1, now), "2026-09-28"); // Monday
  assert.equal(nextWeekday(3, now), "2026-09-30"); // Wednesday → next week, not today
});

test("SQLite timestamps are read as UTC", () => {
  assert.equal(sqliteTime("2026-09-23 10:00:00").toISOString(), "2026-09-23T10:00:00.000Z");
  assert.equal(sqliteTime(null), null);
});
