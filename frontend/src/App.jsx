import { useEffect, useState } from "react";
import { api, loginUrl } from "./api";
import Header from "./components/Header";
import Icon from "./components/Icon";
import SettingsDialog from "./components/SettingsDialog";
import Overview from "./pages/Overview";
import ReposPage from "./pages/ReposPage";
import RepoPage from "./pages/RepoPage";
import "./App.css";

function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash || "#/");
  useEffect(() => {
    const onChange = () => {
      setHash(window.location.hash || "#/");
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

function Footer() {
  return (
    <footer className="app-footer">
      <span className="footer-brand">
        <Icon name="book" /> © {new Date().getFullYear()} DevDiary2026
      </span>
      <nav>
        <a href="/privacy.html">Privacy</a>
        <a href="/terms.html">Terms</a>
        <a href="https://github.com/Krishmal2004/DevDiary2026" target="_blank" rel="noreferrer">
          Source
        </a>
        <a href="https://github.com/Krishmal2004/DevDiary2026/issues" target="_blank" rel="noreferrer">
          Support
        </a>
      </nav>
    </footer>
  );
}

function Login() {
  return (
    <div className="login">
      <main className="login-main">
        <span className="login-logo">
          <Icon name="book" size={32} />
        </span>
        <h1>Sign in to DevDiary2026</h1>
        <div className="box login-box">
          <p>
            Your personal work log next to GitHub: a daily diary drafted from your commits and pull requests, todos that
            aren&apos;t tied to any repo, and email reminders when they&apos;re due.
          </p>
          <a className="btn btn-primary btn-block btn-large" href={loginUrl}>
            Sign in with GitHub
          </a>
        </div>
        <p className="login-note muted">
          Read-only access to the repositories you choose. <a href="/privacy.html">Privacy</a>
        </p>
      </main>
      <Footer />
    </div>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [state, setState] = useState("loading");
  const [error, setError] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const route = useHashRoute();

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
    window.location.hash = "";
  }

  if (state === "loading") {
    return (
      <main className="centered muted" aria-busy="true">
        <span className="spinner" /> Loading…
      </main>
    );
  }
  if (state === "error") {
    return (
      <main className="centered">
        <p className="flash flash-error">{error}</p>
      </main>
    );
  }
  if (state === "signed-out") {
    return <Login />;
  }

  const repoMatch = route.match(/^#\/repos\/([\w.-]+)\/([\w.-]+)$/);
  let page;
  if (repoMatch) {
    page = <RepoPage key={route} owner={repoMatch[1]} name={repoMatch[2]} />;
  } else if (route.startsWith("#/repos")) {
    page = <ReposPage />;
  } else {
    page = <Overview user={user} onEditSettings={() => setShowSettings(true)} />;
  }

  return (
    <div className="app">
      <Header user={user} route={route} onSettings={() => setShowSettings(true)} onLogout={logout} />
      <main className="container">{page}</main>
      <Footer />
      {showSettings && <SettingsDialog user={user} onClose={() => setShowSettings(false)} onSaved={setUser} />}
    </div>
  );
}

export default App;
