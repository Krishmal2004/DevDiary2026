const vscode = require("vscode");
const { localDate, formatDay } = require("../dates");

// The Diary view: today first (even without an entry yet), then recent
// entries newest first. Clicking one opens it as a Markdown document.

class DiaryView {
  constructor(store, auth) {
    this.store = store;
    this.auth = auth;
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    store.onDidChange(() => this.refresh());
  }

  refresh() {
    this._onDidChangeTreeData.fire();
    if (this.treeView) {
      this.treeView.message =
        this.auth.signedIn && this.store.entries === null && !this.store.entriesError ? "Loading diary…" : undefined;
    }
  }

  getChildren(element) {
    if (!this.auth.signedIn || element) return [];
    if (this.store.entriesError) return [{ kind: "error", message: this.store.entriesError }];
    if (this.store.entries === null) return [];

    const today = localDate();
    const entries = [...this.store.entries].sort((a, b) => b.entry_date.localeCompare(a.entry_date));
    const todayEntry = entries.find((e) => e.entry_date === today);
    return [
      { kind: "entry", date: today, entry: todayEntry || null, isToday: true },
      ...entries.filter((e) => e.entry_date !== today).map((e) => ({ kind: "entry", date: e.entry_date, entry: e })),
    ];
  }

  getTreeItem(element) {
    if (element.kind === "error") {
      const item = new vscode.TreeItem(element.message);
      item.iconPath = new vscode.ThemeIcon("warning", new vscode.ThemeColor("list.warningForeground"));
      item.command = { command: "devdiary.refresh", title: "Retry" };
      return item;
    }

    const { date, entry, isToday } = element;
    const item = new vscode.TreeItem(isToday ? `Today — ${formatDay(date)}` : formatDay(date));
    item.id = `diary:${date}`;
    item.description = entry ? summary(entry.content) : "no entry yet";
    item.iconPath = new vscode.ThemeIcon(entry ? "book" : "edit");
    item.tooltip = entry ? new vscode.MarkdownString(entry.content.slice(0, 1500)) : "Write today's entry";
    item.contextValue = entry ? "entry" : "emptyDay";
    item.command = { command: "devdiary.openDate", title: "Open Entry", arguments: [date] };
    return item;
  }
}

// The first line of real text, without markdown syntax.
function summary(content) {
  for (const line of content.split("\n")) {
    const text = line
      .replace(/^#+\s*|^[-*+]\s+|^>\s*/g, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[`*_]/g, "")
      .trim();
    if (text && !/^What I worked on/.test(text)) return text.length > 60 ? `${text.slice(0, 59)}…` : text;
  }
  return "";
}

module.exports = { DiaryView, summary };
