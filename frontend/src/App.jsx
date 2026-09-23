import { useEffect, useState } from "react";
import { api, loginUrl } from "./api";
import DiaryPanel from "./components/DiaryPanel";
import TodosPanel from "./components/TodosPanel";
import SettingsDialog from "./components/SettingsDialog";
import "./App.css";

function Login() {
  return (
    <main className="login">
      <div className="login-card">
        <h1>DevDiary2026</h1>
        <p className="tagline">
          Your personal work log alongside GitHub — a daily diary drafted from your commits and PRs, todos that
          aren&apos;t tied to any repo, and email reminders when they&apos;re due.
        </p>
        <a className="button github" href={loginUrl}>
          Sign in with GitHub
        </a>
      </div>
    </main>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [state, setState] = useState("loading");
  const [error, setError] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    api
      .me()
      .then(async (me) => {
        // Record the browser's time zone the first time, for reminder emails.
        if (!me.timezone) {
          const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
          me = await api.updateMe({ timezone }).catch(() => me);
        }
        setUser(me);
        setState("ready");
      })
      .catch((err) => {
        if (err.status === 401) {
          setState("signed-out");
        } else {
          setError(err.message);
          setState("error");
        }
      });
  }, []);

  async function logout() {
    await api.logout().catch(() => {});
    setUser(null);
    setState("signed-out");
  }

  if (state === "loading") {
    return <main className="centered">Loading…</main>;
  }
  if (state === "error") {
    return (
      <main className="centered">
        <p className="notice error">{error}</p>
      </main>
    );
  }
  if (state === "signed-out") {
    return <Login />;
  }

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">DevDiary2026</span>
        <div className="topbar-user">
          {user.avatar_url && <img src={user.avatar_url} alt="" className="avatar" />}
          <span className="username">{user.username}</span>
          <button type="button" className="secondary small" onClick={() => setShowSettings(true)}>
            Settings
          </button>
          <button type="button" className="secondary small" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>

      <main className="dashboard">
        <DiaryPanel />
        <TodosPanel remindersActive={!!user.email && user.reminders_enabled} />
      </main>

      {showSettings && <SettingsDialog user={user} onClose={() => setShowSettings(false)} onSaved={setUser} />}
    </div>
  );
}

export default App;
