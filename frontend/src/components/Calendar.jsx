import { toDateKey, todayKey } from "../dates";
import Icon from "./Icon";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

// Month grid (weeks start on Monday). Days with a diary entry get a dot.
export default function Calendar({ year, month, selected, entryDates, onSelect, onMonthChange }) {
  const first = new Date(year, month, 1);
  const leading = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = todayKey();

  const cells = [];
  for (let i = 0; i < leading; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(toDateKey(new Date(year, month, d)));

  const title = first.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="calendar">
      <div className="calendar-header">
        <button type="button" className="btn btn-sm btn-invisible icon-btn" onClick={() => onMonthChange(-1)} aria-label="Previous month">
          <Icon name="chevronLeft" />
        </button>
        <span className="calendar-title">{title}</span>
        <button type="button" className="btn btn-sm btn-invisible icon-btn" onClick={() => onMonthChange(1)} aria-label="Next month">
          <Icon name="chevronRight" />
        </button>
      </div>
      <div className="calendar-grid">
        {WEEKDAYS.map((w) => (
          <span key={w} className="calendar-weekday">
            {w}
          </span>
        ))}
        {cells.map((key, i) =>
          key ? (
            <button
              key={key}
              type="button"
              className={[
                "calendar-day",
                key === selected && "selected",
                key === today && "today",
                key > today && "future",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onSelect(key)}
              aria-pressed={key === selected}
              aria-label={key + (entryDates.has(key) ? " (has entry)" : "")}
            >
              {Number(key.slice(8))}
              {entryDates.has(key) && <span className="calendar-dot" />}
            </button>
          ) : (
            <span key={`blank-${i}`} />
          )
        )}
      </div>
      <button type="button" className="btn btn-sm btn-block calendar-today" onClick={() => onSelect(today)}>
        <Icon name="calendar" /> Today
      </button>
    </div>
  );
}
