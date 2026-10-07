const path = require("node:path");
const vscode = require("vscode");
const conflictGit = require("./git");

// Warns about merge conflicts before you open a pull request. Whenever the
// staged changes change (`git add .` in the terminal, staging in the Source
// Control view), it merges them in memory with the base branch and marks the
// lines that would conflict: squiggles in the editor, entries in the Problems
// panel, a status bar count and a one-time notification per result.
//
// Repositories come from the built-in Git extension. Without it (disabled,
// virtual workspace) only the "Check Merge Conflicts" command works. Git
// isn't run in untrusted workspaces, since repository config can run code.

const DEBOUNCE_MS = 1500;
const FETCH_EVERY_MS = 2 * 60 * 1000;
const MAX_SNIPPET_LINES = 6;

function settings() {
  const c = vscode.workspace.getConfiguration("devdiary.conflicts");
  return {
    enabled: c.get("enabled", true),
    baseBranch: c.get("baseBranch", ""),
    fetch: c.get("fetch", true),
    notify: c.get("notify", true),
  };
}

function snippet(lines) {
  if (lines.length === 0) return "    (deleted)";
  const shown = lines.slice(0, MAX_SNIPPET_LINES).map((l) => `    ${l}`);
  if (lines.length > MAX_SNIPPET_LINES) shown.push(`    … ${lines.length - MAX_SNIPPET_LINES} more lines`);
  return shown.join("\n");
}

class ConflictChecker {
  constructor() {
    this.diagnostics = vscode.languages.createDiagnosticCollection("devdiary.conflicts");
    this.item = vscode.window.createStatusBarItem("devdiary.conflicts", vscode.StatusBarAlignment.Left, 49);
    this.item.name = "DevDiary Merge Conflicts";
    this.item.command = "workbench.actions.view.problems";
    this.disposables = [this.diagnostics, this.item];
    this.repos = new Map(); // root -> { timer, lastKey, lastFetch, files: Set<string>, summary, running, again }
    this.output = null;
    this.hookGitExtension();
  }

  // --- Watching repositories -------------------------------------------

  async hookGitExtension() {
    const extension = vscode.extensions.getExtension("vscode.git");
    if (!extension) return;
    let api;
    try {
      const exports = extension.isActive ? extension.exports : await extension.activate();
      api = exports.getAPI(1);
    } catch {
      return;
    }
    const watch = (repo) => {
      const root = repo.rootUri.fsPath;
      this.disposables.push(repo.state.onDidChange(() => this.schedule(root)));
      this.schedule(root);
    };
    api.repositories.forEach(watch);
    this.disposables.push(
      api.onDidOpenRepository(watch),
      api.onDidCloseRepository((repo) => this.clearRepo(repo.rootUri.fsPath))
    );
  }

  // Git state changes come in bursts; check once they settle.
  schedule(root) {
    const repo = this.repo(root);
    clearTimeout(repo.timer);
    repo.timer = setTimeout(() => this.check(root).catch(() => {}), DEBOUNCE_MS);
  }

  repo(root) {
    if (!this.repos.has(root)) {
      this.repos.set(root, { timer: null, lastKey: null, lastFetch: 0, files: new Set(), summary: null });
    }
    return this.repos.get(root);
  }

  // --- Checking ---------------------------------------------------------

  // Runs the check for one repository. Background checks skip work when
  // neither the staged snapshot nor the base branch moved since last time,
  // and stay silent on errors; `manual` checks always run and report.
  async check(root, { manual = false } = {}) {
    const opts = settings();
    if (!manual && !opts.enabled) return this.clearRepo(root);
    if (!vscode.workspace.isTrusted) {
      if (manual) vscode.window.showWarningMessage("DevDiary doesn't run git in untrusted workspaces.");
      return null;
    }
    const repo = this.repo(root);
    if (repo.running) {
      repo.again = true;
      return null;
    }
    repo.running = true;
    try {
      const baseRef = await conflictGit.findBaseRef(root, opts.baseBranch);
      if (!baseRef) {
        if (manual) vscode.window.showWarningMessage("No base branch found. Set devdiary.conflicts.baseBranch.");
        this.clearRepo(root);
        return null;
      }

      // Nothing staged compared with HEAD: nothing to warn about yet.
      const { code: diffCode } = await conflictGit.git(root, ["diff", "--cached", "--quiet"], { okCodes: [0, 1] });
      if (diffCode === 0 && !manual) {
        this.clearRepo(root);
        return null;
      }

      if (opts.fetch && (manual || Date.now() - repo.lastFetch > FETCH_EVERY_MS)) {
        repo.lastFetch = Date.now();
        await conflictGit.fetchBase(root, baseRef);
      }

      const tree = await conflictGit.stagedTree(root);
      const baseCommit = (await conflictGit.git(root, ["rev-parse", baseRef])).stdout.trim();
      const key = `${tree}:${baseCommit}`;
      if (!manual && key === repo.lastKey) return repo.summary;

      const result = await conflictGit.predictConflicts(root, baseRef);
      repo.lastKey = key;
      const summary = await this.show(root, result);
      if (manual || (opts.notify && summary.fileCount > 0 && key !== repo.notifiedKey)) {
        repo.notifiedKey = key;
        this.announce(summary, manual);
      }
      return summary;
    } catch (err) {
      this.log(`[${root}] ${err.message}`);
      if (manual) vscode.window.showErrorMessage(`Couldn't check for merge conflicts: ${err.message}`);
      return null;
    } finally {
      repo.running = false;
      if (repo.again) {
        repo.again = false;
        this.schedule(root);
      }
    }
  }

  // Turns a prediction into diagnostics on the files in the working tree.
  async show(root, result) {
    const repo = this.repo(root);
    for (const file of repo.files) this.diagnostics.delete(vscode.Uri.file(file));
    repo.files = new Set();

    let regionCount = 0;
    for (const file of result.files) {
      const uri = vscode.Uri.file(path.join(root, file.path));
      const lines = await this.readLines(uri);
      const estimates = conflictGit.estimateOursLines(file.regions);
      const diagnostics = file.regions.map((region, i) => {
        const { start, end } = conflictGit.locateRegion(lines, region, estimates[i]);
        const range = new vscode.Range(start, 0, end, (lines[end] || "").length);
        const message =
          `Merge conflict with ${result.baseRef}: these lines were also changed there.\n` +
          `${result.baseRef} has:\n${snippet(region.theirs)}`;
        return this.diagnostic(range, message);
      });
      regionCount += diagnostics.length;
      if (diagnostics.length === 0) {
        const text = file.messages.join("\n") || `Merge conflict with ${result.baseRef}.`;
        diagnostics.push(this.diagnostic(new vscode.Range(0, 0, 0, (lines[0] || "").length), text));
        regionCount += 1;
      }
      this.diagnostics.set(uri, diagnostics);
      repo.files.add(uri.fsPath);
    }

    repo.summary = { root, baseRef: result.baseRef, fileCount: result.files.length, regionCount, files: result.files };
    this.updateStatusBar();
    return repo.summary;
  }

  diagnostic(range, message) {
    const d = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Warning);
    d.source = "DevDiary";
    d.code = "merge-conflict";
    return d;
  }

  // The open editor's text if there is one, else the file on disk.
  async readLines(uri) {
    const doc = vscode.workspace.textDocuments.find((d) => d.uri.fsPath === uri.fsPath);
    if (doc) return doc.getText().split(/\r?\n/);
    try {
      return Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8").split(/\r?\n/);
    } catch {
      return [];
    }
  }

  async announce(summary, manual) {
    if (summary.fileCount === 0) {
      if (manual) vscode.window.showInformationMessage(`No merge conflicts with ${summary.baseRef}. 🎉`);
      return;
    }
    const files = summary.files.map((f) => f.path);
    const named = files.length <= 3 ? `: ${files.join(", ")}` : "";
    const choice = await vscode.window.showWarningMessage(
      `Your staged changes will conflict with ${summary.baseRef} in ` +
        `${summary.fileCount} file${summary.fileCount === 1 ? "" : "s"}${named}.`,
      "Show Conflicts",
      "Open File"
    );
    if (choice === "Show Conflicts") {
      vscode.commands.executeCommand("workbench.actions.view.problems");
    } else if (choice === "Open File") {
      const first = summary.files[0];
      const uri = vscode.Uri.file(path.join(summary.root, first.path));
      const diags = this.diagnostics.get(uri) || [];
      const editor = await vscode.window.showTextDocument(uri);
      if (diags[0]) {
        editor.selection = new vscode.Selection(diags[0].range.start, diags[0].range.start);
        editor.revealRange(diags[0].range, vscode.TextEditorRevealType.InCenter);
      }
    }
  }

  updateStatusBar() {
    let files = 0;
    let regions = 0;
    const bases = new Set();
    for (const repo of this.repos.values()) {
      if (!repo.summary || repo.summary.fileCount === 0) continue;
      files += repo.summary.fileCount;
      regions += repo.summary.regionCount;
      bases.add(repo.summary.baseRef);
    }
    if (files === 0) {
      this.item.hide();
      return;
    }
    this.item.text = `$(git-merge) ${regions} conflict${regions === 1 ? "" : "s"}`;
    this.item.tooltip = `Staged changes will conflict with ${[...bases].join(", ")} in ${files} file${files === 1 ? "" : "s"}`;
    this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
    this.item.show();
  }

  clearRepo(root) {
    const repo = this.repos.get(root);
    if (!repo) return null;
    for (const file of repo.files) this.diagnostics.delete(vscode.Uri.file(file));
    repo.files = new Set();
    repo.summary = null;
    repo.lastKey = null;
    this.updateStatusBar();
    return null;
  }

  clearAll() {
    for (const root of this.repos.keys()) this.clearRepo(root);
  }

  // "Check Merge Conflicts" command: the active file's repository, else
  // every open repository.
  async checkNow() {
    const roots = new Set(this.repos.keys());
    const active = vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri;
    const start = active && active.scheme === "file" ? path.dirname(active.fsPath) : null;
    const folder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
    const probe = start || (folder && folder.uri.scheme === "file" ? folder.uri.fsPath : null);
    if (probe) {
      try {
        const root = await conflictGit.repoRoot(probe);
        roots.clear();
        roots.add(root);
      } catch {
        // Not inside a repository; fall back to the ones the Git extension found.
      }
    }
    if (roots.size === 0) {
      vscode.window.showWarningMessage("No git repository is open.");
      return [];
    }
    return vscode.window.withProgress(
      { location: vscode.ProgressLocation.Window, title: "$(git-merge) Checking for merge conflicts" },
      () => Promise.all([...roots].map((root) => this.check(root, { manual: true })))
    );
  }

  onConfigChanged() {
    for (const repo of this.repos.values()) repo.lastKey = null;
    if (!settings().enabled) return this.clearAll();
    for (const root of this.repos.keys()) this.schedule(root);
  }

  log(line) {
    if (!this.output) this.output = vscode.window.createOutputChannel("DevDiary Conflicts");
    this.output.appendLine(line);
  }

  dispose() {
    for (const repo of this.repos.values()) clearTimeout(repo.timer);
    for (const d of this.disposables) d.dispose();
    if (this.output) this.output.dispose();
  }
}

module.exports = { ConflictChecker };
