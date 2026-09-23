import { parseDateKey, toDateKey, todayKey } from "../dates";
import Icon from "./Icon";

function addDays(key, delta) {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + delta);
  return toDateKey(d);
}

// Consecutive days ending today (or yesterday, if today has nothing yet).
function currentStreak(isActive) {
  let day = todayKey();
  if (!isActive(day)) day = addDays(day, -1);
  let streak = 0;
  while (isActive(day) && streak < 3660) {
    streak++;
    day = addDays(day, -1);
  }
  return streak;
}

function longestStreak(days) {
  let best = 0;
  let run = 0;
  for (const day of days) {
    run = day.count > 0 ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

function Stat({ icon, value, label }) {
  return (
    <li className="profile-stat">
      <Icon name={icon} />
      <span>
        <strong>{value}</strong> {label}
      </span>
    </li>
  );
}

export default function ProfileSidebar({ user, contributions, diaryDates, openTodos, onEditSettings }) {
  const days = contributions ? contributions.weeks.flat() : [];
  const counts = new Map(days.map((d) => [d.date, d.count]));
  const plural = (n, word) => `${word}${n === 1 ? "" : "s"}`;

  const codingStreak = contributions ? currentStreak((d) => (counts.get(d) ?? 0) > 0) : null;
  const bestStreak = contributions ? longestStreak(days) : null;
  const writingStreak = currentStreak((d) => diaryDates.has(d));

  return (
    <aside className="profile-sidebar">
      {user.avatar_url && <img src={user.avatar_url} alt="" className="avatar profile-avatar" />}
      <h1 className="profile-name">{user.username}</h1>
      <a className="profile-login muted" href={`https://github.com/${user.username}`} target="_blank" rel="noreferrer">
        github.com/{user.username}
      </a>

      <button type="button" className="btn btn-block profile-edit" onClick={onEditSettings}>
        Edit settings
      </button>

      <ul className="profile-details">
        <li>
          <Icon name="mail" />
          {user.email ? (
            <span className="truncate">{user.email}</span>
          ) : (
            <button type="button" className="link-btn" onClick={onEditSettings}>
              Add a reminder email
            </button>
          )}
        </li>
        <li>
          <Icon name="bell" />
          Reminders {user.reminders_enabled && user.email ? "on" : "off"}
        </li>
        {user.timezone && (
          <li>
            <Icon name="clock" />
            {user.timezone}
          </li>
        )}
      </ul>

      <div className="profile-divider" />
      <h2 className="profile-heading">Activity</h2>
      <ul className="profile-stats">
        {codingStreak !== null && (
          <Stat icon="flame" value={codingStreak} label={`${plural(codingStreak, "day")} coding streak`} />
        )}
        {bestStreak !== null && (
          <Stat icon="graph" value={bestStreak} label={`${plural(bestStreak, "day")} longest streak this year`} />
        )}
        <Stat icon="pencil" value={writingStreak} label={`${plural(writingStreak, "day")} writing streak`} />
        <Stat
          icon="book"
          value={diaryDates.size}
          label={`diary ${diaryDates.size === 1 ? "entry" : "entries"} this year`}
        />
        {openTodos !== null && <Stat icon="issueOpened" value={openTodos} label={`open ${plural(openTodos, "todo")}`} />}
      </ul>
    </aside>
  );
}
