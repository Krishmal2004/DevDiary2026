import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { timeAgo } from "../format";
import Icon from "./Icon";

// SQLite's datetime('now') is UTC without a zone marker.
function sqliteTime(value) {
  return value ? `${value.replace(" ", "T")}Z` : null;
}

// Editors (the VS Code extension) signed in with an API token.
function ConnectedEditors() {
  const [tokens, setTokens] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.listTokens().then(setTokens, (err) => setError(err.message));
  }, []);

  async function revoke(id) {
    setError(null);
    try {
      await api.revokeToken(id);
      setTokens((current) => current.filter((t) => t.id !== id));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="form-group">
      <span className="form-label">Connected editors</span>
      {tokens === null && !error && <span className="form-note">Loading…</span>}
      {tokens?.length === 0 && (
        <span className="form-note">None. Sign in from the DevDiary VS Code extension to connect one.</span>
      )}
      {tokens?.length > 0 && (
        <ul className="token-list">
          {tokens.map((t) => (
            <li key={t.id}>
              <span>
                <strong>{t.name}</strong>
                <span className="form-note">
                  Connected {timeAgo(sqliteTime(t.created_at))} · last used {timeAgo(sqliteTime(t.last_used_at))}
                </span>
              </span>
              <button type="button" className="btn btn-sm btn-danger" onClick={() => revoke(t.id)}>
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="flash flash-error">{error}</p>}
    </div>
  );
}

export default function SettingsDialog({ user, onClose, onSaved }) {
  const [email, setEmail] = useState(user.email ?? "");
  const [remindersEnabled, setRemindersEnabled] = useState(user.reminders_enabled);
  const [timezone, setTimezone] = useState(user.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const updated = await api.updateMe({ email: email.trim() || null, reminders_enabled: remindersEnabled, timezone });
      onSaved(updated);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="dialog"
      onCancel={onClose}
      onClick={(e) => e.target === dialogRef.current && onClose()}
      aria-labelledby="settings-heading"
    >
      <form onSubmit={submit}>
        <div className="dialog-header">
          <h2 id="settings-heading">Settings</h2>
          <button type="button" className="btn btn-sm btn-invisible icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>

        <div className="dialog-body">
          <label className="form-group">
            <span className="form-label">Reminder email</span>
            <input
              className="form-control"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
            <span className="form-note">Due todos are emailed here. Your public GitHub email is used by default.</span>
          </label>

          <label className="form-checkbox">
            <input type="checkbox" checked={remindersEnabled} onChange={(e) => setRemindersEnabled(e.target.checked)} />
            <span>
              <strong>Email reminders</strong>
              <span className="form-note">Get an email when a todo you created is due.</span>
            </span>
          </label>

          <label className="form-group">
            <span className="form-label">Time zone</span>
            <input className="form-control" type="text" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
            <span className="form-note">Used to show due times in reminder emails, e.g. Asia/Colombo.</span>
          </label>

          <ConnectedEditors />

          {error && <p className="flash flash-error">{error}</p>}
        </div>

        <div className="dialog-footer">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Saving…" : "Save settings"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
