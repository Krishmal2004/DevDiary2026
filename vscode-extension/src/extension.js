const vscode = require("vscode");
const { Api } = require("./api");
const { Auth } = require("./auth");
const { Store } = require("./state");
const { localDate } = require("./dates");
const { DiaryFileSystem, SCHEME } = require("./diaryFileSystem");
const { TodayView } = require("./views/todayView");
const { TodosView } = require("./views/todosView");
const { DiaryView } = require("./views/diaryView");
const { DueStatusBar } = require("./statusBar");
const { DueNotifier } = require("./notifier");
const diaryCommands = require("./commands/diary");
const todoCommands = require("./commands/todos");

const FOCUS_REFRESH_MS = 60 * 1000;

function config() {
  return vscode.workspace.getConfiguration("devdiary");
}

function serverUrl() {
  return (config().get("serverUrl") || "http://localhost:4000").trim().replace(/\/+$/, "");
}

async function activate(context) {
  const push = (...disposables) => context.subscriptions.push(...disposables);

  let auth;
  const api = new Api({ getServerUrl: serverUrl, getToken: () => auth.getToken() });
  auth = new Auth(context, api, serverUrl);
  const store = new Store(api, auth);
  push(auth, store);

  // Views
  const todayView = new TodayView(store, auth);
  const todosView = new TodosView(store, auth);
  const diaryView = new DiaryView(store, auth);
  todayView.treeView = vscode.window.createTreeView("devdiary.today", { treeDataProvider: todayView });
  todosView.treeView = vscode.window.createTreeView("devdiary.todos", { treeDataProvider: todosView });
  diaryView.treeView = vscode.window.createTreeView("devdiary.diary", { treeDataProvider: diaryView });
  push(todayView.treeView, todosView.treeView, diaryView.treeView);
  push(
    todayView.treeView.onDidChangeVisibility((e) => {
      if (e.visible && auth.signedIn) store.refreshActivityIfStale();
    })
  );

  // Diary documents, sign-in callback, status bar, notifications
  const diaryFs = new DiaryFileSystem(api, store);
  const statusBar = new DueStatusBar(store, auth);
  push(
    diaryFs,
    vscode.workspace.registerFileSystemProvider(SCHEME, diaryFs, { isCaseSensitive: true }),
    vscode.window.registerUriHandler({ handleUri: (uri) => auth.handleUri(uri) }),
    statusBar,
    new DueNotifier(context, store, api, auth)
  );

  // Commands
  const run = (id, fn) => push(vscode.commands.registerCommand(id, fn));
  run("devdiary.signIn", (options) => auth.signIn(options && options.reauth ? { reauth: true } : {}));
  run("devdiary.signOut", async () => {
    await auth.signOut();
    vscode.window.showInformationMessage("Signed out of DevDiary.");
  });
  run("devdiary.pasteCode", () => auth.pasteCode());
  run("devdiary.refresh", () => store.refresh());
  run("devdiary.openUrl", (url) => {
    if (typeof url === "string" && /^https?:\/\//.test(url)) vscode.env.openExternal(vscode.Uri.parse(url));
  });
  run("devdiary.openDashboard", () => vscode.env.openExternal(vscode.Uri.parse(serverUrl())));
  diaryCommands.register(context, { api, store });
  todoCommands.register(context, { api, store, todosView });

  // Keep everything in step with the signed-in state.
  const refreshViews = () => {
    todayView.refresh();
    todosView.refresh();
    diaryView.refresh();
  };
  push(
    auth.onDidChange((signedIn) => {
      vscode.commands.executeCommand("setContext", "devdiary.signedIn", signedIn);
      store.clear();
      refreshViews();
      if (signedIn) store.refresh();
    })
  );

  // Background refresh, plus a full refresh when the date rolls over.
  let timer;
  let lastDate = localDate();
  const startTimer = () => {
    clearInterval(timer);
    const minutes = Math.max(1, Number(config().get("refreshInterval")) || 5);
    timer = setInterval(() => {
      if (!auth.signedIn) return;
      const today = localDate();
      const rolledOver = today !== lastDate;
      lastDate = today;
      store.refresh({ activity: rolledOver || todayView.treeView.visible });
    }, minutes * 60 * 1000);
  };
  startTimer();
  push({ dispose: () => clearInterval(timer) });

  push(
    vscode.window.onDidChangeWindowState((state) => {
      if (state.focused && auth.signedIn && Date.now() - store.lastRefresh > FOCUS_REFRESH_MS) {
        store.refresh({ activity: todayView.treeView.visible });
      }
    }),
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration("devdiary.serverUrl")) {
        // Each server has its own sign-in.
        store.clear();
        const signedIn = await auth.load();
        vscode.commands.executeCommand("setContext", "devdiary.signedIn", signedIn);
        refreshViews();
        if (signedIn) store.refresh();
      }
      if (e.affectsConfiguration("devdiary.refreshInterval")) startTimer();
      if (e.affectsConfiguration("devdiary.statusBar.enabled")) statusBar.update();
    })
  );

  // Signing in (here, from a stored token) fires onDidChange above, which
  // loads the data.
  vscode.commands.executeCommand("setContext", "devdiary.showDone", false);
  const signedIn = await auth.load();
  if (!signedIn) vscode.commands.executeCommand("setContext", "devdiary.signedIn", false);

  // Exposed for integration tests.
  return { api, auth, store };
}

function deactivate() {}

module.exports = { activate, deactivate };
