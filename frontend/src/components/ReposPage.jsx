import { useEffect, useMemo, useState } from "react";
import { api, loginUrl } from "../api";

function timeAgo(iso) {
  if (!iso) return "never";
  const seconds = (Date.now() - new Date(iso)) / 1000;
  const units = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  for (const [unit, size] of units) {
    if (seconds >= size) {
      return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(-Math.floor(seconds / size), unit);
    }
  }
  return "just now";
}

function ErrorNotice({ error }) {
  if (!error) return null;
  if (error === "reauth") {
    return (
      <p className="notice error">
        Your GitHub session expired. <a href={loginUrl}>Sign in again</a> to load repositories.
      </p>
    );
  }
  return <p className="notice error">{error}</p>;
}

function RepoDetail({ fullName, onClose }) {
  const [repo, setRepo] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .repo(fullName)
      .then((data) => !cancelled && setRepo(data))
      .catch((err) => !cancelled && setError(err.body?.reauth ? "reauth" : err.message));
    return () => {
      cancelled = true;
    };
  }, [fullName]);

  return (
    <section className="panel repo-detail" aria-labelledby="repo-detail-heading">
      <div className="panel-header">
        <h2 id="repo-detail-heading">
          <a href={`https://github.com/${fullName}`} target="_blank" rel="noreferrer">
            {fullName}
          </a>
        </h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close repository details">
          ×
        </button>
      </div>
      <ErrorNotice error={error} />
      {!repo && !error && <p className="status">Loading…</p>}
      {repo && (
        <>
          {repo.description && <p className="repo-description">{repo.description}</p>}
          <div className="repo-columns">
            <div>
              <h3>
                Recent commits <span className="count">{repo.commits.totalCount}</span>
              </h3>
              <ul className="feed">
                {repo.commits.items.map((c) => (
                  <li key={c.sha}>
                    <a href={c.url} target="_blank" rel="noreferrer">
                      <code>{c.sha.slice(0, 7)}</code> {c.message}
                    </a>
                    <span className="feed-meta">
                      {c.author} · {timeAgo(c.committedAt)}
                    </span>
                  </li>
                ))}
                {repo.commits.items.length === 0 && <li className="empty">No commits on {repo.defaultBranch || "the default branch"}.</li>}
              </ul>
            </div>
            <div>
              <h3>
                Open pull requests <span className="count">{repo.pullRequests.totalCount}</span>
              </h3>
              <ul className="feed">
                {repo.pullRequests.items.map((p) => (
                  <li key={p.number}>
                    <a href={p.url} target="_blank" rel="noreferrer">
                      #{p.number} {p.title}
                    </a>
                    <span className="feed-meta">
                      {p.draft && "Draft · "}
                      {p.author} · updated {timeAgo(p.updatedAt)}
                    </span>
                  </li>
                ))}
                {repo.pullRequests.items.length === 0 && <li className="empty">No open pull requests.</li>}
              </ul>
            </div>
            <div>
              <h3>
                Open issues {repo.issues && <span className="count">{repo.issues.totalCount}</span>}
              </h3>
              {repo.issuesError ? (
                <p className="notice info">{repo.issuesError}</p>
              ) : (
                <ul className="feed">
                  {repo.issues.items.map((i) => (
                    <li key={i.number}>
                      <a href={i.url} target="_blank" rel="noreferrer">
                        #{i.number} {i.title}
                      </a>
                      <span className="feed-meta">
                        {i.labels.map((l) => (
                          <span key={l.name} className="label" style={{ borderColor: `#${l.color}` }}>
                            {l.name}
                          </span>
                        ))}
                        {i.author} · updated {timeAgo(i.updatedAt)}
                      </span>
                    </li>
                  ))}
                  {repo.issues.items.length === 0 && <li className="empty">No open issues.</li>}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

export default function ReposPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [visibility, setVisibility] = useState("all");
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    api
      .repos()
      .then(setData)
      .catch((err) => setError(err.body?.reauth ? "reauth" : err.message));
  }, []);

  const repos = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.repositories.filter(
      (r) =>
        (visibility === "all" || (visibility === "private") === r.private) &&
        (!q || r.fullName.toLowerCase().includes(q) || (r.description || "").toLowerCase().includes(q))
    );
  }, [data, query, visibility]);

  const onlySelected = data?.installations.some((i) => i.repositorySelection === "selected");

  return (
    <div className="repos-page">
      <section className="panel" aria-labelledby="repos-heading">
        <div className="panel-header">
          <h2 id="repos-heading">
            Repositories {data && <span className="count">{data.repositories.length}</span>}
          </h2>
          {data && (
            <a className="button secondary" href={data.installUrl} target="_blank" rel="noreferrer">
              Add repositories
            </a>
          )}
        </div>

        <ErrorNotice error={error} />
        {!data && !error && <p className="status">Loading repositories…</p>}

        {data && data.installations.length === 0 && (
          <p className="notice info">
            DevDiary2026 isn&apos;t installed on any of your accounts yet.{" "}
            <a href={data.installUrl} target="_blank" rel="noreferrer">
              Install it on your repositories
            </a>{" "}
            to see them here.
          </p>
        )}
        {onlySelected && (
          <p className="notice info">
            Some installations only include selected repositories. To load everything, choose{" "}
            <strong>All repositories</strong> in{" "}
            {data.installations
              .filter((i) => i.repositorySelection === "selected")
              .map((i, idx) => (
                <span key={i.id}>
                  {idx > 0 && ", "}
                  <a href={i.settingsUrl} target="_blank" rel="noreferrer">
                    {i.account}&apos;s installation settings
                  </a>
                </span>
              ))}
            .
          </p>
        )}

        {data && data.repositories.length > 0 && (
          <>
            <div className="repo-filters">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a repository…"
                aria-label="Filter repositories"
                className="grow"
              />
              <div className="segmented" role="tablist">
                {["all", "public", "private"].map((v) => (
                  <button key={v} type="button" role="tab" aria-selected={visibility === v} onClick={() => setVisibility(v)}>
                    {v[0].toUpperCase() + v.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <ul className="repo-list">
              {repos.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className={`repo-card${selected === r.fullName ? " selected" : ""}`}
                    onClick={() => setSelected(r.fullName)}
                  >
                    <span className="repo-name">
                      {r.fullName}
                      <span className="badge muted">{r.private ? "Private" : "Public"}</span>
                      {r.archived && <span className="badge muted">Archived</span>}
                      {r.fork && <span className="badge muted">Fork</span>}
                    </span>
                    {r.description && <span className="repo-description">{r.description}</span>}
                    <span className="repo-meta">
                      {r.language && <span>{r.language}</span>}
                      <span>★ {r.stars}</span>
                      <span>{r.openIssues} open issues/PRs</span>
                      <span>pushed {timeAgo(r.pushedAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
              {repos.length === 0 && <li className="empty">No repositories match.</li>}
            </ul>
          </>
        )}
      </section>

      {selected && <RepoDetail key={selected} fullName={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
