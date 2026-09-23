import { useEffect, useState } from "react";
import { api, loginUrl } from "../api";
import { languageColor, timeAgo } from "../format";
import Icon from "../components/Icon";

const TABS = [
  ["commits", "Commits", "commit"],
  ["pulls", "Pull requests", "pullRequest"],
  ["issues", "Issues", "issueOpened"],
];

function CommitRows({ commits, defaultBranch }) {
  if (commits.items.length === 0) {
    return <div className="blankslate">No commits on {defaultBranch || "the default branch"} yet.</div>;
  }
  return (
    <ul className="feed-list">
      {commits.items.map((c) => (
        <li key={c.sha} className="box-row feed-row">
          <Icon name="commit" className="feed-icon muted" />
          <div className="feed-main">
            <a className="feed-title" href={c.url} target="_blank" rel="noreferrer">
              {c.message}
            </a>
            <span className="feed-meta">
              <strong>{c.author}</strong> committed {timeAgo(c.committedAt)}
            </span>
          </div>
          <a className="btn btn-sm sha" href={c.url} target="_blank" rel="noreferrer">
            {c.sha.slice(0, 7)}
          </a>
        </li>
      ))}
    </ul>
  );
}

function PullRows({ pullRequests }) {
  if (pullRequests.items.length === 0) {
    return <div className="blankslate">No open pull requests.</div>;
  }
  return (
    <ul className="feed-list">
      {pullRequests.items.map((p) => (
        <li key={p.number} className="box-row feed-row">
          <Icon name="pullRequest" className={`feed-icon ${p.draft ? "muted" : "state-open"}`} />
          <div className="feed-main">
            <a className="feed-title" href={p.url} target="_blank" rel="noreferrer">
              {p.title}
            </a>
            {p.draft && <span className="label">Draft</span>}
            <span className="feed-meta">
              #{p.number} opened by {p.author} · updated {timeAgo(p.updatedAt)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function IssueRows({ issues, issuesError }) {
  if (issuesError) {
    return (
      <div className="box-body">
        <p className="flash flash-warn">{issuesError}</p>
      </div>
    );
  }
  if (issues.items.length === 0) {
    return <div className="blankslate">No open issues.</div>;
  }
  return (
    <ul className="feed-list">
      {issues.items.map((i) => (
        <li key={i.number} className="box-row feed-row">
          <Icon name="issueOpened" className="feed-icon state-open" />
          <div className="feed-main">
            <a className="feed-title" href={i.url} target="_blank" rel="noreferrer">
              {i.title}
            </a>
            {i.labels.map((l) => (
              <span
                key={l.name}
                className="issue-label"
                style={{ "--label-color": `#${l.color}` }}
              >
                {l.name}
              </span>
            ))}
            <span className="feed-meta">
              #{i.number} opened by {i.author} · updated {timeAgo(i.updatedAt)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function RepoPage({ owner, name }) {
  const [repo, setRepo] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("commits");

  useEffect(() => {
    api
      .repo(`${owner}/${name}`)
      .then(setRepo)
      .catch((err) => setError(err.body?.reauth ? "reauth" : err.message));
  }, [owner, name]);

  const counts = repo && {
    commits: repo.commits.totalCount,
    pulls: repo.pullRequests.totalCount,
    issues: repo.issues?.totalCount,
  };

  return (
    <div className="repo-page">
      <a href="#/repos" className="back-link">
        <Icon name="arrowLeft" /> All repositories
      </a>

      <div className="repo-header">
        <h1 className="repo-title">
          <Icon name={repo?.private ? "lock" : "repo"} className="muted" />
          <span className="repo-owner">{owner}</span>
          <span className="muted">/</span>
          <strong>{name}</strong>
          {repo && <span className="label">{repo.private ? "Private" : "Public"}</span>}
        </h1>
        <a className="btn" href={`https://github.com/${owner}/${name}`} target="_blank" rel="noreferrer">
          <Icon name="external" /> View on GitHub
        </a>
      </div>

      {error === "reauth" ? (
        <p className="flash flash-error">
          Your GitHub session expired. <a href={loginUrl}>Sign in again</a> to load this repository.
        </p>
      ) : (
        error && <p className="flash flash-error">{error}</p>
      )}

      {!repo && !error && (
        <div className="blankslate" aria-busy="true">
          <span className="spinner" /> Loading repository…
        </div>
      )}

      {repo && (
        <>
          <div className="repo-about">
            {repo.description && <p>{repo.description}</p>}
            <div className="repo-item-meta">
              {repo.language && (
                <span className="meta-item">
                  <span className="language-dot" style={{ background: languageColor(repo.language) }} />
                  {repo.language}
                </span>
              )}
              <span className="meta-item">
                <Icon name="star" /> {repo.stars.toLocaleString()} stars
              </span>
              <span className="meta-item">{repo.forks.toLocaleString()} forks</span>
              {repo.defaultBranch && (
                <span className="meta-item">
                  <Icon name="commit" /> {repo.defaultBranch}
                </span>
              )}
            </div>
          </div>

          <nav className="underline-nav repo-tabs" aria-label="Repository">
            {TABS.map(([key, label, icon]) => (
              <button
                key={key}
                type="button"
                className="underline-nav-item"
                aria-current={tab === key ? "page" : undefined}
                onClick={() => setTab(key)}
              >
                <Icon name={icon} />
                {label}
                {counts[key] !== undefined && <span className="counter">{counts[key].toLocaleString()}</span>}
              </button>
            ))}
          </nav>

          <div className="box">
            {tab === "commits" && <CommitRows commits={repo.commits} defaultBranch={repo.defaultBranch} />}
            {tab === "pulls" && <PullRows pullRequests={repo.pullRequests} />}
            {tab === "issues" && <IssueRows issues={repo.issues} issuesError={repo.issuesError} />}
          </div>
        </>
      )}
    </div>
  );
}
