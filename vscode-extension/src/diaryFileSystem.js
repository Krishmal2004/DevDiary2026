const vscode = require("vscode");
const { NotSignedInError } = require("./api");
const { isValidDate, formatDay, sqliteTime } = require("./dates");

// Diary entries as files: devdiary:/diary/YYYY-MM-DD.md. Opening one reads
// the entry (a missing entry is an empty file); saving writes it back. So
// entries get the normal Markdown editor, preview and extensions.

const SCHEME = "devdiary";
const CACHE_MS = 2000;

function diaryUri(date) {
  return vscode.Uri.from({ scheme: SCHEME, path: `/diary/${date}.md` });
}

// YYYY-MM-DD for a diary URI, or null.
function dateFromUri(uri) {
  if (!uri || uri.scheme !== SCHEME) return null;
  const match = /^\/diary\/(\d{4}-\d{2}-\d{2})\.md$/.exec(uri.path);
  return match && isValidDate(match[1]) ? match[1] : null;
}

class DiaryFileSystem {
  constructor(api, store) {
    this.api = api;
    this.store = store;
    this.cache = new Map(); // date → { entry, fetchedAt }
    this._onDidChangeFile = new vscode.EventEmitter();
    this.onDidChangeFile = this._onDidChangeFile.event;
  }

  toFsError(err, uri) {
    if (err instanceof vscode.FileSystemError) return err;
    if (err instanceof NotSignedInError) {
      this.store.errorMessage(err);
      return vscode.FileSystemError.NoPermissions("Sign in to DevDiary to open your diary.");
    }
    return vscode.FileSystemError.Unavailable(`${uri.path}: ${err.message}`);
  }

  requireDate(uri) {
    const date = dateFromUri(uri);
    if (!date) throw vscode.FileSystemError.FileNotFound(uri);
    return date;
  }

  async entryFor(date, { fresh = false } = {}) {
    const cached = this.cache.get(date);
    if (!fresh && cached && Date.now() - cached.fetchedAt < CACHE_MS) return cached.entry;
    const entry = await this.api.getDiary(date);
    this.cache.set(date, { entry, fetchedAt: Date.now() });
    return entry;
  }

  watch() {
    return new vscode.Disposable(() => {});
  }

  async stat(uri) {
    if (uri.path === "/" || uri.path === "/diary") {
      return { type: vscode.FileType.Directory, ctime: 0, mtime: 0, size: 0 };
    }
    const date = this.requireDate(uri);
    try {
      const entry = await this.entryFor(date, { fresh: true });
      if (!entry) return { type: vscode.FileType.File, ctime: 0, mtime: 0, size: 0 };
      return {
        type: vscode.FileType.File,
        ctime: sqliteTime(entry.created_at).getTime(),
        mtime: sqliteTime(entry.updated_at).getTime(),
        size: Buffer.byteLength(entry.content),
      };
    } catch (err) {
      throw this.toFsError(err, uri);
    }
  }

  async readDirectory(uri) {
    if (uri.path === "/") return [["diary", vscode.FileType.Directory]];
    if (uri.path !== "/diary") throw vscode.FileSystemError.FileNotFound(uri);
    const entries = this.store.entries || [];
    return entries.map((e) => [`${e.entry_date}.md`, vscode.FileType.File]);
  }

  async readFile(uri) {
    const date = this.requireDate(uri);
    try {
      const entry = await this.entryFor(date);
      return Buffer.from(entry ? entry.content : "", "utf8");
    } catch (err) {
      throw this.toFsError(err, uri);
    }
  }

  async writeFile(uri, content) {
    const date = this.requireDate(uri);
    // Entries are stored with LF endings, whatever the editor's EOL setting
    // (new documents default to CRLF on Windows).
    const text = Buffer.from(content).toString("utf8").replace(/\r\n/g, "\n");
    try {
      const existing = await this.entryFor(date, { fresh: true });
      if (!text.trim()) {
        // The API doesn't store empty entries, so an empty save is a delete.
        if (!existing) return;
        const choice = await vscode.window.showWarningMessage(
          `Delete your diary entry for ${formatDay(date)}?`,
          { modal: true, detail: "Diary entries can't be empty, so saving an empty entry deletes it." },
          "Delete Entry"
        );
        if (choice !== "Delete Entry") {
          throw vscode.FileSystemError.NoPermissions("Not saved: diary entries can't be empty.");
        }
        await this.api.deleteDiary(existing.id);
        this.cache.set(date, { entry: null, fetchedAt: Date.now() });
      } else {
        const saved = await this.api.saveDiary(date, text);
        this.cache.set(date, { entry: saved, fetchedAt: Date.now() });
      }
    } catch (err) {
      throw this.toFsError(err, uri);
    }
    this._onDidChangeFile.fire([{ type: vscode.FileChangeType.Changed, uri }]);
    this.store.refreshDiary();
  }

  async delete(uri) {
    const date = this.requireDate(uri);
    try {
      const existing = await this.entryFor(date, { fresh: true });
      if (existing) await this.api.deleteDiary(existing.id);
      this.cache.delete(date);
    } catch (err) {
      throw this.toFsError(err, uri);
    }
    this._onDidChangeFile.fire([{ type: vscode.FileChangeType.Deleted, uri }]);
    this.store.refreshDiary();
  }

  createDirectory(uri) {
    throw vscode.FileSystemError.NoPermissions(uri);
  }

  rename(uri) {
    throw vscode.FileSystemError.NoPermissions(uri);
  }

  dispose() {
    this._onDidChangeFile.dispose();
  }
}

module.exports = { DiaryFileSystem, diaryUri, dateFromUri, SCHEME };
