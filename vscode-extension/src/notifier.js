const vscode = require("vscode");
const { isDue, dueLabel } = require("./dates");

// Shows a notification when an open todo becomes due, alongside the email
// reminder. Checks the cached todos every 30 seconds (no network), so it
// fires close to the due time. Each todo notifies once per due date; the
// keys already shown are kept in globalState across restarts.

const CHECK_MS = 30 * 1000;
const STATE_KEY = "devdiary.notifiedTodos";
const MAX_SEPARATE = 3;

function notifyKey(todo) {
  return `${todo.id}@${todo.due_date}`;
}

class DueNotifier {
  constructor(context, store, api, auth) {
    this.context = context;
    this.store = store;
    this.api = api;
    this.auth = auth;
    this.timer = setInterval(() => this.check(), CHECK_MS);
    this.subscription = store.onDidChange(() => this.check());
  }

  async check() {
    const enabled = vscode.workspace.getConfiguration("devdiary").get("notifications.dueTodos", true);
    const todos = this.store.todos;
    if (!enabled || !this.auth.signedIn || !todos || this.checking) return;

    const notified = new Set(this.context.globalState.get(STATE_KEY, []));
    const due = todos.filter((t) => isDue(t));
    const fresh = due.filter((t) => !notified.has(notifyKey(t)));
    if (fresh.length === 0) return;

    // Remember only todos that are still due, so the list doesn't grow.
    this.checking = true;
    try {
      await this.context.globalState.update(STATE_KEY, due.map(notifyKey));
    } finally {
      this.checking = false;
    }

    if (fresh.length > MAX_SEPARATE) {
      const choice = await vscode.window.showInformationMessage(
        `${fresh.length} DevDiary todos are due.`,
        "Show Todos"
      );
      if (choice === "Show Todos") vscode.commands.executeCommand("devdiary.todos.focus");
      return;
    }
    for (const todo of fresh) this.notify(todo);
  }

  async notify(todo) {
    const choice = await vscode.window.showInformationMessage(
      `Due ${dueLabel(todo.due_date)}: ${todo.title}`,
      "Mark Done",
      "Snooze 1 Hour",
      todo.linked_url ? "Open Link" : "Show Todos"
    );
    try {
      if (choice === "Mark Done") {
        await this.api.updateTodo(todo.id, { done: true });
      } else if (choice === "Snooze 1 Hour") {
        // Moving the due date also re-arms the email reminder.
        await this.api.updateTodo(todo.id, { due_date: new Date(Date.now() + 60 * 60 * 1000).toISOString() });
      } else if (choice === "Open Link") {
        vscode.env.openExternal(vscode.Uri.parse(todo.linked_url));
        return;
      } else if (choice === "Show Todos") {
        vscode.commands.executeCommand("devdiary.todos.focus");
        return;
      } else {
        return;
      }
    } catch (err) {
      if (err.status !== 401) vscode.window.showErrorMessage(`Couldn't update the todo: ${err.message}`);
    }
    this.store.refreshTodos();
  }

  dispose() {
    clearInterval(this.timer);
    this.subscription.dispose();
  }
}

module.exports = { DueNotifier };
