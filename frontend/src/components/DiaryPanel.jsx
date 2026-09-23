import { useCallback, useEffect, useState } from "react";
import { api, loginUrl } from "../api";
import { formatLongDate, monthRange, parseDateKey, todayKey } from "../dates";
import Calendar from "./Calendar";
import Icon from "./Icon";
import Markdown from "./Markdown";

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function monthOf(key) {
  const d = parseDateKey(key);
  return { year: d.getFullYear(), month: d.getMonth() };
}

// The selected day is owned by the parent so the contribution graph can pick
// it too. `dirtyRef` tells the parent when leaving would lose unsaved text.
export default function DiaryPanel({ selected, onSelect, dirtyRef, onEntryChange }) {
  const [view, setView] = useState(() => monthOf(selected));
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

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty, dirtyRef]);

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

  // When the selected day changes (from here or the contribution graph),
  // clear per-day messages and show its month.
  const [shownDate, setShownDate] = useState(selected);
  if (shownDate !== selected) {
    setShownDate(selected);
    setActivity(null);
    setStatus(null);
    setError(null);
    const target = monthOf(selected);
    if (target.year !== view.year || target.month !== view.month) setView(target);
  }

  // Load the editor when the selected day changes, or when that day's entry
  // first arrives from the server.
  const editorKey = `${selected}:${entry?.id ?? "new"}`;
  const [loadedKey, setLoadedKey] = useState(null);
  if (loadedKey !== editorKey) {
    setLoadedKey(editorKey);
    setContent(entry?.content ?? "");
    setMode(entry ? "preview" : "write");
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
      onEntryChange(selected, true);
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
      onEntryChange(selected, false);
    } catch (err) {
      setError(err.message);
    }
  }

  const isFuture = selected > todayKey();

  return (
    <section className="box" aria-labelledby="diary-heading">
      <div className="box-header">
        <h2 id="diary-heading" className="box-title">
          <Icon name="book" /> Diary
        </h2>
        <span className="header-spacer" />
        {entry ? (
          <span className="label label-success">
            <Icon name="check" size={12} /> Written
          </span>
        ) : (
          <span className="label">{isFuture ? "Planning" : "No entry yet"}</span>
        )}
      </div>

      <div className="diary-layout">
        <Calendar
          year={view.year}
          month={view.month}
          selected={selected}
          entryDates={new Set(Object.keys(entries))}
          onSelect={onSelect}
          onMonthChange={changeMonth}
        />

        <div className="diary-editor">
          <h3 className="diary-date">{formatLongDate(selected)}</h3>

          {error === "reauth" ? (
            <p className="flash flash-error">
              Your GitHub session expired. <a href={loginUrl}>Sign in again</a> to pull activity.
            </p>
          ) : (
            error && <p className="flash flash-error">{error}</p>
          )}

          {activity && (
            <p className="flash flash-info">
              Pulled {plural(activity.totals.commits, "commit")}, {plural(activity.totals.pullRequests, "pull request")},{" "}
              {plural(activity.totals.issues ?? 0, "issue")} and {plural(activity.totals.reviews, "review")} from
              GitHub. Edit the draft, then save.
            </p>
          )}

          <div className="comment-box">
            <div className="comment-tabs" role="tablist">
              <button type="button" role="tab" className="comment-tab" aria-selected={mode === "write"} onClick={() => setMode("write")}>
                Write
              </button>
              <button
                type="button"
                role="tab"
                className="comment-tab"
                aria-selected={mode === "preview"}
                onClick={() => setMode("preview")}
                disabled={!content.trim()}
              >
                Preview
              </button>
              <span className="header-spacer" />
              <button
                type="button"
                className="btn btn-sm btn-invisible"
                onClick={draftFromGitHub}
                disabled={drafting || isFuture}
                title={isFuture ? "No activity yet for future days" : "Add this day's commits, PRs and issues"}
              >
                <Icon name="download" />
                {drafting ? "Pulling…" : "Draft from GitHub"}
              </button>
            </div>

            <div className="comment-body">
              {mode === "write" ? (
                <textarea
                  className="form-control diary-textarea"
                  value={content}
                  onChange={(e) => {
                    setContent(e.target.value);
                    setStatus(null);
                  }}
                  placeholder={
                    isFuture
                      ? "Plan ahead: what do you want to get done this day?"
                      : "What did you work on? Use “Draft from GitHub” to start from your commits and PRs."
                  }
                  aria-label={`Diary entry for ${selected}`}
                />
              ) : (
                <div className="diary-preview">
                  <Markdown source={content} />
                </div>
              )}
            </div>

            <div className="comment-footer">
              <span className="muted small">
                {dirty ? "Unsaved changes" : status === "Saved" ? "✓ Saved" : "Markdown is supported"}
              </span>
              <span className="header-spacer" />
              {entry && (
                <button type="button" className="btn btn-danger" onClick={remove}>
                  <Icon name="trash" /> Delete
                </button>
              )}
              <button type="button" className="btn btn-primary" onClick={save} disabled={saving || !dirty || !content.trim()}>
                {saving ? "Saving…" : entry ? "Update entry" : "Save entry"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
