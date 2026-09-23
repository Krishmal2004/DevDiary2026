import { useEffect, useRef } from "react";
import Icon from "./Icon";

const TABS = [
  { href: "#/", label: "Overview", icon: "book", match: (route) => route === "#/" },
  { href: "#/repos", label: "Repositories", icon: "repo", match: (route) => route.startsWith("#/repos") },
];

// Avatar dropdown, built on <details> the way GitHub's own menus are, so it
// works with the keyboard and without extra state.
function UserMenu({ user, onSettings, onLogout }) {
  const ref = useRef(null);

  useEffect(() => {
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) ref.current.open = false;
    };
    const onKey = (e) => {
      if (e.key === "Escape" && ref.current) ref.current.open = false;
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const pick = (fn) => () => {
    ref.current.open = false;
    fn();
  };

  return (
    <details className="user-menu" ref={ref}>
      <summary aria-label="Open user menu">
        {user.avatar_url ? <img src={user.avatar_url} alt="" className="avatar avatar-sm" /> : <Icon name="book" />}
        <Icon name="chevronDown" size={12} />
      </summary>
      <div className="menu" role="menu">
        <div className="menu-header">
          Signed in as <strong>{user.username}</strong>
        </div>
        <a className="menu-item" role="menuitem" href={`https://github.com/${user.username}`} target="_blank" rel="noreferrer">
          <Icon name="external" /> Your GitHub profile
        </a>
        <button type="button" className="menu-item" role="menuitem" onClick={pick(onSettings)}>
          <Icon name="gear" /> Settings
        </button>
        <div className="menu-divider" />
        <button type="button" className="menu-item" role="menuitem" onClick={pick(onLogout)}>
          <Icon name="signOut" /> Sign out
        </button>
      </div>
    </details>
  );
}

export default function Header({ user, route, onSettings, onLogout }) {
  return (
    <header className="app-header">
      <div className="app-header-top">
        <a href="#/" className="app-logo">
          <span className="app-logo-mark">
            <Icon name="book" size={20} />
          </span>
          <span>DevDiary2026</span>
        </a>
        <span className="header-spacer" />
        <UserMenu user={user} onSettings={onSettings} onLogout={onLogout} />
      </div>
      <nav className="underline-nav" aria-label="Main">
        {TABS.map((tab) => (
          <a
            key={tab.href}
            href={tab.href}
            className="underline-nav-item"
            aria-current={tab.match(route) ? "page" : undefined}
          >
            <Icon name={tab.icon} />
            {tab.label}
          </a>
        ))}
      </nav>
    </header>
  );
}
