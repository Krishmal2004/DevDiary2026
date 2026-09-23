const vscode = require("vscode");
const { formatDay } = require("../dates");

// The Today view: today's commits (by repository), pull requests, issues
// and reviews from GET /api/github/activity.

class TodayView {
  constructor(store, auth) {
    this.store = store;
    this.auth = auth;
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    store.onDidChange(() => this.refresh());
  }

  refresh() {
    this._onDidChangeTreeData.fire();
    if (!this.treeView) return;
    const { activity, activityError, activityDate } = this.store;
    this.treeView.description = activityDate ? formatDay(activityDate) : undefined;
    this.treeView.message =
      this.auth.signedIn && !activity && !activityError ? "Loading today's GitHub activity…" : undefined;
  }

  getChildren(element) {
    if (!this.auth.signedIn) return [];
    if (element) return element.children;

    const { activity, activityError } = this.store;
    if (activityError === "reauth") return [{ kind: "reauth" }];
    if (activityError) return [{ kind: "error", message: activityError }];
    if (!activity) return [];

    const groups = [];
    if (activity.commitRepos.length > 0) {
      groups.push({
        kind: "group",
        label: "Commits",
        icon: "git-commit",
        count: activity.totals.commits,
        children: activity.commitRepos.map((repo) => ({
          kind: "repo",
          repo,
          children: repo.commits.map((commit) => ({ kind: "commit", commit })),
        })),
      });
    }
    const section = (label, icon, items, kind) => {
      if (items.length > 0) {
        groups.push({ kind: "group", label, icon, count: items.length, children: items.map((i) => ({ kind, item: i })) });
      }
    };
    section("Pull requests", "git-pull-request", activity.pullRequests, "pr");
    section("Issues", "issues", activity.issues, "issue");
    section("Reviews", "eye", activity.reviews, "review");

    if (groups.length === 0) return [{ kind: "empty" }];
    return groups;
  }

  getTreeItem(element) {
    const Collapsed = vscode.TreeItemCollapsibleState;
    switch (element.kind) {
      case "group": {
        const item = new vscode.TreeItem(element.label, Collapsed.Expanded);
        item.id = `today:${element.label}`;
        item.description = String(element.count);
        item.iconPath = new vscode.ThemeIcon(element.icon);
        return item;
      }
      case "repo": {
        const { repo } = element;
        const item = new vscode.TreeItem(repo.repo, repo.commits.length > 0 ? Collapsed.Collapsed : Collapsed.None);
        item.id = `today:repo:${repo.repo}`;
        item.description = `${repo.count} commit${repo.count === 1 ? "" : "s"}`;
        item.iconPath = new vscode.ThemeIcon("repo");
        item.tooltip = repo.url;
        item.command = openUrl(repo.url);
        return item;
      }
      case "commit": {
        const { commit } = element;
        const item = new vscode.TreeItem(commit.message);
        item.description = commit.sha.slice(0, 7);
        item.tooltip = `${commit.sha.slice(0, 7)} ${commit.message}\n${new Date(commit.committedAt).toLocaleString()}`;
        item.command = openUrl(commit.url);
        return item;
      }
      case "pr":
      case "issue":
      case "review": {
        const { item: data } = element;
        const item = new vscode.TreeItem(data.title);
        item.description = `${data.repo}#${data.number}${data.state ? ` · ${data.state.toLowerCase()}` : ""}`;
        item.iconPath = new vscode.ThemeIcon(
          { pr: "git-pull-request", issue: "issues", review: "eye" }[element.kind],
          stateColor(data.state)
        );
        item.tooltip = `${data.title}\n${data.repo}#${data.number}`;
        item.command = openUrl(data.url);
        return item;
      }
      case "reauth": {
        const item = new vscode.TreeItem("GitHub access expired — sign in again");
        item.iconPath = new vscode.ThemeIcon("warning", new vscode.ThemeColor("list.warningForeground"));
        item.tooltip = "Your diary and todos still work. Sign in again to see GitHub activity.";
        item.command = { command: "devdiary.signIn", title: "Sign In", arguments: [{ reauth: true }] };
        return item;
      }
      case "empty": {
        const item = new vscode.TreeItem("No GitHub activity yet today");
        item.iconPath = new vscode.ThemeIcon("coffee");
        return item;
      }
      default: {
        const item = new vscode.TreeItem(element.message);
        item.iconPath = new vscode.ThemeIcon("warning", new vscode.ThemeColor("list.warningForeground"));
        item.tooltip = `${element.message}\nClick to retry.`;
        item.command = { command: "devdiary.refresh", title: "Retry" };
        return item;
      }
    }
  }
}

function openUrl(url) {
  return { command: "devdiary.openUrl", title: "Open on GitHub", arguments: [url] };
}

function stateColor(state) {
  if (state === "MERGED") return new vscode.ThemeColor("charts.purple");
  if (state === "OPEN") return new vscode.ThemeColor("charts.green");
  if (state === "CLOSED") return new vscode.ThemeColor("charts.red");
  return undefined;
}

module.exports = { TodayView };
