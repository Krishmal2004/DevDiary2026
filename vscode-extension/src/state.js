const vscode = require("vscode");
const { NotSignedInError, GitHubReauthError } = require("./api");
const { localDate, addDays, tzOffset } = require("./dates");

// The last fetched todos, diary entries and today's GitHub activity. Views,
// the status bar and the notifier all read from here, so one refresh
// updates everything with one request per resource.

const DIARY_DAYS_BACK = 60;
const ACTIVITY_MAX_AGE_MS = 10 * 60 * 1000;

class Store {
  constructor(api, auth) {
    this.api = api;
    this.auth = auth;
    this.inFlight = new Map();
    this._onDidChange = new vscode.EventEmitter();
    this.onDidChange = this._onDidChange.event;
    this.reset();
  }

  reset() {
    this.todos = null;
    this.todosError = null;
    this.entries = null;
    this.entriesError = null;
    this.activity = null;
    this.activityError = null; // "reauth" when GitHub access has expired
    this.activityDate = null;
    this.activityFetchedAt = 0;
    this.lastRefresh = 0;
  }

  clear() {
    this.reset();
    this._onDidChange.fire();
  }

  // Runs one fetch per resource at a time; later callers share it.
  once(key, fn) {
    if (!this.inFlight.has(key)) {
      this.inFlight.set(
        key,
        fn().finally(() => this.inFlight.delete(key))
      );
    }
    return this.inFlight.get(key);
  }

  // Maps an error to a message, ending the session on a rejected token.
  errorMessage(err) {
    if (err instanceof NotSignedInError) {
      this.auth.sessionEnded();
      return null;
    }
    return err.message;
  }

  refreshTodos() {
    return this.once("todos", async () => {
      try {
        this.todos = await this.api.listTodos();
        this.todosError = null;
      } catch (err) {
        this.todosError = this.errorMessage(err);
      }
      this._onDidChange.fire();
    });
  }

  refreshDiary() {
    return this.once("diary", async () => {
      const today = localDate();
      try {
        this.entries = await this.api.listDiary(addDays(today, -DIARY_DAYS_BACK), addDays(today, 30));
        this.entriesError = null;
      } catch (err) {
        this.entriesError = this.errorMessage(err);
      }
      this._onDidChange.fire();
    });
  }

  refreshActivity() {
    return this.once("activity", async () => {
      const today = localDate();
      try {
        this.activity = await this.api.activity(today, tzOffset(today));
        this.activityError = null;
      } catch (err) {
        if (this.activityDate !== today) this.activity = null;
        this.activityError = err instanceof GitHubReauthError ? "reauth" : this.errorMessage(err);
      }
      this.activityDate = today;
      this.activityFetchedAt = Date.now();
      this._onDidChange.fire();
    });
  }

  // Today's activity costs several GitHub API calls, so it's only refetched
  // when stale or when the day has changed.
  refreshActivityIfStale() {
    if (this.activityDate !== localDate() || Date.now() - this.activityFetchedAt > ACTIVITY_MAX_AGE_MS) {
      return this.refreshActivity();
    }
    return Promise.resolve();
  }

  async refresh({ activity = true } = {}) {
    if (!this.auth.signedIn) return;
    this.lastRefresh = Date.now();
    await Promise.all([this.refreshTodos(), this.refreshDiary(), activity ? this.refreshActivity() : null]);
  }

  dispose() {
    this._onDidChange.dispose();
  }
}

module.exports = { Store };
