import { useCallback, useEffect, useState } from "react";
import { api, loginUrl } from "../api";
import { formatLongDate, monthRange, parseDateKey, todayKey } from "../dates";
import Calendar from "./Calendar";
import Markdown from "./Markdown";

export default function DiaryPanel() {
  const [selected, setSelected] = useState(todayKey());
  const [view, setView] = useState(() => {
    const d = parseDateKey(todayKey());
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [entries, setEntries] = useState({});
  const [content, setContent] = useState("");
  const [mode, setMode] = useState("write");
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [activity, setActivity] = useState(null);
  const [drafting, setDrafting] = useState(false);
  const [saving, setSaving] = useState(false);

  const entry = entries[selected];
  const dirty = content !== (entry?.content ?? "");

  const loadMonth = useCallback(async ({ year, month }) => {
    const { from, to } = monthRange(year, month);
    try {
      const list = await api.listDiary(from, to);
      setEntries((prev) => ({ ...prev, ...Object.fromEntries(list.map((e) => [e.entry_date, e])) }));
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    loadMonth(view);
  }, [view, loadMonth]);

  // Load the editor when the selected day changes, or when that day's entry
  // first arrives from the server.
  const editorKey = `${selected}:${entry?.id ?? "new"}`;
  const [loadedKey, setLoadedKey] = useState(null);
  if (loadedKey !== editorKey) {
    setLoadedKey(editorKey);
    setContent(entry?.content ?? "");
    setMode(entry ? "preview" : "write");
  }

  function selectDate(key) {
    if (key === selected) return;
    if (dirty && !window.confirm("Discard unsaved changes to this entry?")) return;
    setActivity(null);
    setStatus(null);
    setError(null);
    setSelected(key);
    const d = parseDateKey(key);
    if (d.getFullYear() !== view.year || d.getMonth() !== view.month) {
      setView({ year: d.getFullYear(), month: d.getMonth() });
    }
  }

  function changeMonth(delta) {
    setView(({ year, month }) => {
      const d = new Date(year, month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  async function draftFromGitHub() {
    setDrafting(true);
    setError(null);
    try {
      const result = await api.activity(selected);
      setActivity(result);
      setContent((current) => (current.trim() ? `${current.trimEnd()}\n\n${result.markdown}` : result.markdown));
      setMode("write");
    } catch (err) {
      setError(err.body?.reauth ? "reauth" : err.message);
    } finally {
      setDrafting(false);
    }
  }

  async function save() {
    if (!content.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await api.saveDiary(selected, content);
      setEntries((prev) => ({ ...prev, [selected]: saved }));
      setStatus("Saved");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!entry || !window.confirm("Delete this diary entry?")) return;
    try {
      await api.deleteDiary(entry.id);
      setEntries((prev) => {
        const next = { ...prev };
        delete next[selected];
        return next;
      });
    } catch (err) {
      setError(err.message);
    }
  }

  const isFuture = selected > todayKey();

  return (
    <section className="panel diary-panel" aria-labelledby="diary-heading">
      <h2 id="diary-heading">Diary</h2>
      <div className="diary-layout">
        <Calendar
          year={view.year}
          month={view.month}
          selected={selected}
          entryDates={new Set(Object.keys(entries))}
          onSelect={selectDate}
          onMonthChange={changeMonth}
        />

        <div className="diary-editor">
          <div className="diary-editor-header">
            <h3>{formatLongDate(selected)}</h3>
            <div className="segmented" role="tablist">
              <button type="button" role="tab" aria-selected={mode === "write"} onClick={() => setMode("write")}>
                Write
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "preview"}
                onClick={() => setMode("preview")}
                disabled={!content.trim()}
              >
                Preview
              </button>
            </div>
          </div>

          {error === "reauth" ? (
            <p className="notice error">
              Your GitHub session expired. <a href={loginUrl}>Sign in again</a> to pull activity.
            </p>
          ) : (
            error && <p className="notice error">{error}</p>
          )}

          {activity && (
            <p className="notice info">
              Pulled {activity.totals.commits} commit{activity.totals.commits === 1 ? "" : "s"},{" "}
              {activity.totals.pullRequests} PR{activity.totals.pullRequests === 1 ? "" : "s"} and{" "}
              {activity.totals.reviews} review{activity.totals.reviews === 1 ? "" : "s"} from GitHub. Edit the draft,
              then save.
            </p>
          )}

          {mode === "write" ? (
            <textarea
              className="diary-textarea"
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                setStatus(null);
              }}
              placeholder={
                isFuture
                  ? "Plan ahead: what do you want to get done this day?"
                  : "What did you work on? Tip: pull your commits and PRs from GitHub to get a head start."
              }
              aria-label={`Diary entry for ${selected}`}
            />
          ) : (
            <div className="diary-preview">
              <Markdown source={content} />
            </div>
          )}

          <div className="diary-actions">
            <button type="button" className="secondary" onClick={draftFromGitHub} disabled={drafting || isFuture}>
              {drafting ? "Pulling activity…" : "Draft from GitHub activity"}
            </button>
            <span className="spacer" />
            {status && !dirty && <span className="status">{status}</span>}
            {dirty && <span className="status">Unsaved changes</span>}
            {entry && (
              <button type="button" className="danger-text" onClick={remove}>
                Delete
              </button>
            )}
            <button type="button" onClick={save} disabled={saving || !dirty || !content.trim()}>
              {saving ? "Saving…" : "Save entry"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
