const vscode = require("vscode");
const { localDate, addDays, nextWeekday, parseDueInput, dueLabel, formatDay } = require("../dates");

// Asks for a due date. Resolves to { value } where value is null (no date),
// "YYYY-MM-DD" or a UTC ISO timestamp; or undefined if cancelled.
async function pickDueDate({ title, current } = {}) {
  const today = localDate();
  const option = (label, value) => ({ label, value, description: value ? formatDay(value) : undefined });
  const items = [
    { label: "$(circle-slash) No due date", value: null },
    option("$(calendar) Today", today),
    option("$(calendar) Tomorrow", addDays(today, 1)),
    option("$(calendar) Next Monday", nextWeekday(1)),
    option("$(calendar) In a week", addDays(today, 7)),
    { label: "$(edit) Custom…", custom: true, description: "YYYY-MM-DD or YYYY-MM-DD HH:mm" },
  ];
  const picked = await vscode.window.showQuickPick(items, {
    title,
    placeHolder: current ? `Currently due ${dueLabel(current)}` : "When is it due?",
  });
  if (!picked) return undefined;
  if (!picked.custom) return { value: picked.value };

  const input = await vscode.window.showInputBox({
    title,
    prompt: "Due date as YYYY-MM-DD (all day) or YYYY-MM-DD HH:mm (local time)",
    value: current && /^\d{4}-\d{2}-\d{2}$/.test(current) ? current : `${today} 17:00`,
    validateInput: (value) => (parseDueInput(value) === undefined ? "Use YYYY-MM-DD or YYYY-MM-DD HH:mm" : null),
  });
  if (input === undefined) return undefined;
  return { value: parseDueInput(input) };
}

function register(context, { api, store, todosView }) {
  const run = (id, fn) => context.subscriptions.push(vscode.commands.registerCommand(id, fn));

  // Runs a change, refreshes todos, and reports failures.
  async function mutate(what, fn) {
    try {
      await fn();
    } catch (err) {
      if (err.status !== 401) vscode.window.showErrorMessage(`Couldn't ${what}: ${err.message}`);
    }
    await store.refreshTodos();
  }

  // The todo from a tree item, or one the user picks.
  async function resolveTodo(arg, { filter = () => true, placeHolder } = {}) {
    if (arg && arg.todo) return arg.todo;
    if (store.todos === null) await store.refreshTodos();
    const todos = (store.todos || []).filter(filter);
    if (todos.length === 0) {
      vscode.window.showInformationMessage("No matching todos.");
      return undefined;
    }
    const picked = await vscode.window.showQuickPick(
      todos.map((todo) => ({
        label: `${todo.done ? "$(pass-filled)" : "$(issues)"} ${todo.title}`,
        description: todo.due_date ? dueLabel(todo.due_date) : undefined,
        todo,
      })),
      { placeHolder, matchOnDescription: true }
    );
    return picked && picked.todo;
  }

  run("devdiary.addTodo", async () => {
    const title = await vscode.window.showInputBox({
      title: "Add Todo (1/2)",
      prompt: "What do you need to do?",
      validateInput: (value) => (value.trim() ? null : "Enter a title"),
    });
    if (!title) return;
    const due = await pickDueDate({ title: "Add Todo (2/2): due date" });
    if (!due) return;
    await mutate("add the todo", () => api.createTodo({ title: title.trim(), due_date: due.value }));
  });

  const toggle = async (arg) => {
    const todo = await resolveTodo(arg, { placeHolder: "Mark a todo done, or reopen a done one" });
    if (!todo) return;
    await mutate(todo.done ? "reopen the todo" : "mark the todo done", () => api.updateTodo(todo.id, { done: !todo.done }));
  };
  run("devdiary.toggleTodo", toggle);
  run("devdiary.reopenTodo", toggle);

  run("devdiary.editTodo", async (arg) => {
    const todo = await resolveTodo(arg, { placeHolder: "Pick a todo to edit" });
    if (!todo) return;
    const title = await vscode.window.showInputBox({
      title: "Edit Todo",
      value: todo.title,
      validateInput: (value) => (value.trim() ? null : "Title can't be empty"),
    });
    if (!title || title.trim() === todo.title) return;
    await mutate("update the todo", () => api.updateTodo(todo.id, { title: title.trim() }));
  });

  run("devdiary.setDueDate", async (arg) => {
    const todo = await resolveTodo(arg, { placeHolder: "Pick a todo" });
    if (!todo) return;
    const due = await pickDueDate({ title: `Due date: ${todo.title}`, current: todo.due_date });
    if (!due) return;
    await mutate("change the due date", () => api.updateTodo(todo.id, { due_date: due.value }));
  });

  run("devdiary.deleteTodo", async (arg) => {
    const todo = await resolveTodo(arg, { placeHolder: "Pick a todo to delete" });
    if (!todo) return;
    const choice = await vscode.window.showWarningMessage(
      `Delete "${todo.title}"?`,
      { modal: true, detail: "This can't be undone." },
      "Delete"
    );
    if (choice !== "Delete") return;
    await mutate("delete the todo", () => api.deleteTodo(todo.id));
  });

  run("devdiary.openTodoLink", async (arg) => {
    const todo = await resolveTodo(arg, { filter: (t) => !!t.linked_url, placeHolder: "Pick a todo" });
    if (todo && todo.linked_url) vscode.env.openExternal(vscode.Uri.parse(todo.linked_url));
  });

  run("devdiary.showDone", () => todosView.setShowDone(true));
  run("devdiary.hideDone", () => todosView.setShowDone(false));
}

module.exports = { register, pickDueDate };
