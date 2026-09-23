const vscode = require("vscode");
const { groupTodos, dueLabel, isOverdue, sqliteTime } = require("../dates");

// The Todos view: open todos grouped by Overdue / Today / Upcoming /
// No date, plus Done when "Show Done" is on.

const GROUPS = [
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "noDate", label: "No date" },
  { key: "done", label: "Done" },
];
const DONE_LIMIT = 50;

class TodosView {
  constructor(store, auth) {
    this.store = store;
    this.auth = auth;
    this.showDone = false;
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    store.onDidChange(() => this.refresh());
  }

  setShowDone(value) {
    this.showDone = value;
    vscode.commands.executeCommand("setContext", "devdiary.showDone", value);
    this.refresh();
  }

  refresh() {
    this._onDidChangeTreeData.fire();
    vscode.commands.executeCommand("setContext", "devdiary.todosLoaded", this.store.todos !== null);
    if (this.treeView) {
      this.treeView.message =
        this.auth.signedIn && this.store.todos === null && !this.store.todosError ? "Loading todos…" : undefined;
    }
  }

  getChildren(element) {
    if (!this.auth.signedIn) return [];
    if (element) return element.todos.map((todo) => ({ kind: "todo", todo }));

    if (this.store.todosError) {
      return [{ kind: "error", message: this.store.todosError }];
    }
    const todos = this.store.todos;
    if (!todos || todos.length === 0) return [];

    const now = new Date();
    const groups = groupTodos(todos, now);
    const items = GROUPS.filter((g) => groups[g.key].length > 0 && (g.key !== "done" || this.showDone)).map((g) => ({
      kind: "group",
      key: g.key,
      label: g.label,
      count: groups[g.key].length,
      todos: g.key === "done" ? groups.done.slice(0, DONE_LIMIT) : groups[g.key],
    }));
    if (items.length === 0) return [{ kind: "allDone", count: groups.done.length }];
    return items;
  }

  getTreeItem(element) {
    switch (element.kind) {
      case "group": {
        const item = new vscode.TreeItem(
          element.label,
          element.key === "done" ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Expanded
        );
        item.id = `group:${element.key}`;
        item.description = String(element.count);
        item.contextValue = "group";
        return item;
      }
      case "todo":
        return todoItem(element.todo);
      case "allDone": {
        const item = new vscode.TreeItem("All done!");
        item.description = `${element.count} completed`;
        item.iconPath = new vscode.ThemeIcon("pass");
        item.command = { command: "devdiary.addTodo", title: "Add Todo" };
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

  getParent() {
    return undefined;
  }
}

function todoItem(todo) {
  const item = new vscode.TreeItem(todo.title, vscode.TreeItemCollapsibleState.None);
  item.id = `todo:${todo.id}`;
  item.description = todo.due_date ? dueLabel(todo.due_date) : "";

  if (todo.done) {
    item.iconPath = new vscode.ThemeIcon("pass-filled", new vscode.ThemeColor("charts.purple"));
  } else if (isOverdue(todo)) {
    item.iconPath = new vscode.ThemeIcon("issues", new vscode.ThemeColor("list.errorForeground"));
  } else {
    item.iconPath = new vscode.ThemeIcon("issues", new vscode.ThemeColor("charts.green"));
  }

  item.contextValue = `todo.${todo.done ? "done" : "open"}${todo.linked_url ? ".linked" : ""}`;

  const tooltip = new vscode.MarkdownString(undefined, true);
  tooltip.appendMarkdown(`**${escapeMarkdown(todo.title)}**\n\n`);
  if (todo.due_date) tooltip.appendMarkdown(`$(calendar) Due ${escapeMarkdown(dueLabel(todo.due_date))}\n\n`);
  if (todo.linked_url) tooltip.appendMarkdown(`$(link) [${escapeMarkdown(todo.linked_url)}](${todo.linked_url})\n\n`);
  const created = sqliteTime(todo.created_at);
  if (created) tooltip.appendMarkdown(`Created ${created.toLocaleDateString()}`);
  item.tooltip = tooltip;

  item.command = todo.linked_url
    ? { command: "devdiary.openTodoLink", title: "Open Linked URL", arguments: [{ kind: "todo", todo }] }
    : { command: "devdiary.editTodo", title: "Edit Todo", arguments: [{ kind: "todo", todo }] };
  return item;
}

function escapeMarkdown(text) {
  return String(text).replace(/[\\`*_{}[\]()#+\-.!|<>]/g, "\\$&");
}

module.exports = { TodosView, escapeMarkdown };
