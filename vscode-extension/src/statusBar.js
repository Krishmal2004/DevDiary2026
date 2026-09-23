const vscode = require("vscode");
const { countDue } = require("./dates");

// "$(checklist) 3 due" — open todos that are overdue or due today. Hidden
// when there are none, when signed out, or when turned off in settings.
class DueStatusBar {
  constructor(store, auth) {
    this.store = store;
    this.auth = auth;
    this.item = vscode.window.createStatusBarItem("devdiary.due", vscode.StatusBarAlignment.Left, 50);
    this.item.name = "DevDiary Due Todos";
    this.item.command = "devdiary.todos.focus";
    store.onDidChange(() => this.update());
    auth.onDidChange(() => this.update());
    this.update();
  }

  update() {
    const enabled = vscode.workspace.getConfiguration("devdiary").get("statusBar.enabled", true);
    const count = this.store.todos ? countDue(this.store.todos) : 0;
    if (!enabled || !this.auth.signedIn || count === 0) {
      this.item.hide();
      return;
    }
    this.item.text = `$(checklist) ${count} due`;
    this.item.tooltip = `${count} DevDiary todo${count === 1 ? " is" : "s are"} overdue or due today`;
    this.item.show();
  }

  dispose() {
    this.item.dispose();
  }
}

module.exports = { DueStatusBar };
