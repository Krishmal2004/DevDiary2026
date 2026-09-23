import { useEffect, useRef } from "react";
import { loginUrl } from "../api";
import { parseDateKey, todayKey } from "../dates";

const WEEKDAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];
const CELL = 13; // 10px square + 3px gap

function describe(day, hasEntry) {
  const date = parseDateKey(day.date).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  const count = day.count === 0 ? "No contributions" : `${day.count} contribution${day.count === 1 ? "" : "s"}`;
  return `${count} on ${date}${hasEntry ? " · diary entry" : ""}`;
}

// GitHub-style contribution heatmap. Clicking a day opens that day's diary
// entry; days with an entry get a ring.
export default function ContributionGraph({ data, error, diaryDates, selected, onSelect }) {
  const scrollRef = useRef(null);

  // On narrow screens the graph scrolls sideways; start at the recent end,
  // as GitHub does.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
  }, [data]);

  if (error) {
    return (
      <section className="graph-section">
        <h2 className="section-title">Contributions</h2>
        <div className="flash flash-error">
          {error === "reauth" ? (
            <>
              Your GitHub session expired. <a href={loginUrl}>Sign in again</a> to load your contribution graph.
            </>
          ) : (
            error
          )}
        </div>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="graph-section" aria-busy="true">
        <h2 className="section-title muted">Loading contributions…</h2>
        <div className="box graph-box graph-skeleton" />
      </section>
    );
  }

  const today = todayKey();
  const months = [];
  data.weeks.forEach((week, i) => {
    const month = parseDateKey(week[0].date).getMonth();
    const prev = i > 0 ? parseDateKey(data.weeks[i - 1][0].date).getMonth() : null;
    if (month !== prev && i < data.weeks.length - 2) {
      months.push({ i, label: parseDateKey(week[0].date).toLocaleDateString(undefined, { month: "short" }) });
    }
  });
  // Drop a leading label that would collide with the next one.
  if (months.length > 1 && months[1].i - months[0].i < 3) months.shift();

  const leading = data.weeks[0]?.[0]?.weekday ?? 0;

  return (
    <section className="graph-section">
      <h2 className="section-title">
        {data.totalContributions.toLocaleString()} contribution{data.totalContributions === 1 ? "" : "s"} in the last
        year
      </h2>
      <div className="box graph-box">
        <div className="graph-scroll" ref={scrollRef}>
          <div className="graph" style={{ "--weeks": data.weeks.length }}>
            <div className="graph-months" style={{ width: data.weeks.length * CELL }}>
              {months.map((m) => (
                <span key={m.i} style={{ left: m.i * CELL }}>
                  {m.label}
                </span>
              ))}
            </div>
            <div className="graph-body">
              <div className="graph-weekdays">
                {WEEKDAY_LABELS.map((label, i) => (
                  <span key={i}>{label}</span>
                ))}
              </div>
              <div className="graph-grid">
                {Array.from({ length: leading }, (_, i) => (
                  <span key={`pad-${i}`} />
                ))}
                {data.weeks.flat().map((day) => {
                  const hasEntry = diaryDates.has(day.date);
                  const label = describe(day, hasEntry);
                  return (
                    <button
                      key={day.date}
                      type="button"
                      className={[
                        "graph-day",
                        `level-${day.level}`,
                        hasEntry && "has-entry",
                        day.date === selected && "selected",
                        day.date > today && "future",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      title={label}
                      aria-label={label}
                      onClick={() => onSelect(day.date)}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        <div className="graph-footer">
          <span className="graph-legend">
            <span className="graph-day has-entry level-0" aria-hidden="true" /> Diary entry
          </span>
          <span className="graph-legend">
            Less
            {[0, 1, 2, 3, 4].map((level) => (
              <span key={level} className={`graph-day level-${level}`} aria-hidden="true" />
            ))}
            More
          </span>
        </div>
      </div>
    </section>
  );
}
