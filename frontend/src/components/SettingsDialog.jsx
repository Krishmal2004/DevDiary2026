import { useEffect, useRef, useState } from "react";
import { api } from "../api";

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
    <dialog ref={dialogRef} className="dialog" onCancel={onClose} aria-labelledby="settings-heading">
      <form onSubmit={submit}>
        <h2 id="settings-heading">Settings</h2>

        <label className="field">
          <span>Reminder email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
          <small>Due todos are emailed here. Your public GitHub email is used by default.</small>
        </label>

        <label className="field checkbox">
          <input
            type="checkbox"
            checked={remindersEnabled}
            onChange={(e) => setRemindersEnabled(e.target.checked)}
          />
          <span>Email me when a todo is due</span>
        </label>

        <label className="field">
          <span>Time zone</span>
          <input type="text" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
          <small>Used to show due times in reminder emails.</small>
        </label>

        {error && <p className="notice error">{error}</p>}

        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
