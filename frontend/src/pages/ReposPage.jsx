import { useEffect, useMemo, useState } from "react";
import { api, loginUrl } from "../api";
import { languageColor, timeAgo } from "../format";
import Icon from "../components/Icon";

const TYPES = [
  ["all", "All"],
  ["public", "Public"],
  ["private", "Private"],
  ["sources", "Sources"],
  ["forks", "Forks"],
  ["archived", "Archived"],
];

const SORTS = [
  ["updated", "Last updated"],
  ["name", "Name"],
  ["stars", "Stars"],
];

function matchesType(repo, type) {
  switch (type) {
    case "public":
      return !repo.private;
    case "private":
      return repo.private;
    case "sources":
      return !repo.fork;
    case "forks":
      return repo.fork;
    case "archived":
      return repo.archived;
    default:
      return true;
  }
}

export default function ReposPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [sort, setSort] = useState("updated");

  useEffect(() => {
    api
      .repos()
      .then(setData)
      .catch((err) => setError(err.body?.reauth ? "reauth" : err.message));
  }, []);

  const repos = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const list = data.repositories.filter(
      (r) => matchesType(r, type) && (!q || r.fullName.toLowerCase().includes(q) || (r.description || "").toLowerCase().includes(q))
    );
    if (sort === "name") list.sort((a, b) => a.fullName.localeCompare(b.fullName));
    if (sort === "stars") list.sort((a, b) => b.stars - a.stars);
    return list;
  }, [data, query, type, sort]);

  const selectedOnly = data?.installations.filter((i) => i.repositorySelection === "selected") ?? [];

  return (
    <div className="repos-page">
      <div className="page-heading">
        <h1>
          Repositories {data && <span className="counter">{data.repositories.length}</span>}
        </h1>
        {data && (
          <a className="btn btn-primary" href={data.installUrl} target="_blank" rel="noreferrer">
            <Icon name="plus" /> Add repositories
          </a>
        )}
      </div>

      {error === "reauth" ? (
        <p className="flash flash-error">
          Your GitHub session expired. <a href={loginUrl}>Sign in again</a> to load repositories.
        </p>
      ) : (
        error && <p className="flash flash-error">{error}</p>
      )}

      {data && selectedOnly.length > 0 && (
        <p className="flash flash-info">
          Only selected repositories are shared from{" "}
          {selectedOnly.map((i, idx) => (
            <span key={i.id}>
              {idx > 0 && ", "}
              <a href={i.settingsUrl} target="_blank" rel="noreferrer">
                {i.account}
              </a>
            </span>
          ))}
          . Choose <strong>All repositories</strong> there to load everything.
        </p>
      )}

      <div className="repo-toolbar">
        <div className="input-with-icon grow">
          <Icon name="search" />
          <input
            className="form-control"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a repository…"
            aria-label="Find a repository"
          />
        </div>
        <label className="select-label">
          <span className="sr-only">Type</span>
          <select className="form-control" value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map(([value, label]) => (
              <option key={value} value={value}>
                Type: {label}
              </option>
            ))}
          </select>
        </label>
        <label className="select-label">
          <span className="sr-only">Sort</span>
          <select className="form-control" value={sort} onChange={(e) => setSort(e.target.value)}>
            {SORTS.map(([value, label]) => (
              <option key={value} value={value}>
                Sort: {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!data && !error && (
        <div className="blankslate" aria-busy="true">
          <span className="spinner" /> Loading repositories…
        </div>
      )}

      {data && data.installations.length === 0 && (
        <div className="box blankslate">
          <Icon name="repo" size={24} />
          <h3>No repositories yet</h3>
          <p>Install DevDiary2026 on your account to see your repositories here.</p>
          <a className="btn btn-primary" href={data.installUrl} target="_blank" rel="noreferrer">
            Install on GitHub
          </a>
        </div>
      )}

      {data && data.repositories.length > 0 && (
        <ul className="repo-list">
          {repos.map((r) => (
            <li key={r.id} className="repo-item">
              <div className="repo-item-main">
                <h3 className="repo-item-title">
                  <a href={`#/repos/${r.fullName}`}>
                    <span className="repo-owner">{r.owner} / </span>
                    {r.name}
                  </a>
                  <span className="label">
                    {r.private ? "Private" : "Public"}
                    {r.archived ? " archive" : ""}
                  </span>
                </h3>
                {r.description && <p className="repo-item-description">{r.description}</p>}
                <div className="repo-item-meta">
                  {r.language && (
                    <span className="meta-item">
                      <span className="language-dot" style={{ background: languageColor(r.language) }} />
                      {r.language}
                    </span>
                  )}
                  {r.stars > 0 && (
                    <span className="meta-item">
                      <Icon name="star" /> {r.stars.toLocaleString()}
                    </span>
                  )}
                  {r.fork && <span className="meta-item">Fork</span>}
                  <span className="meta-item">Updated {timeAgo(r.pushedAt)}</span>
                </div>
              </div>
              <a className="btn btn-sm" href={r.url} target="_blank" rel="noreferrer" aria-label={`Open ${r.fullName} on GitHub`}>
                <Icon name="external" /> GitHub
              </a>
            </li>
          ))}
          {repos.length === 0 && (
            <li className="blankslate">
              No repositories match <strong>{query || TYPES.find(([v]) => v === type)[1]}</strong>.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
