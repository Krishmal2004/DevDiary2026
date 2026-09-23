// The only module that talks to the DevDiary backend. It adds the API token
// and turns failed responses into typed errors the rest of the extension
// can act on. Uses Node's global fetch; no VS Code API, so it's unit-tested.

class ApiError extends Error {
  constructor(status, message, body) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

// The API token is missing, invalid or revoked: the user must sign in again.
class NotSignedInError extends ApiError {
  constructor(message = "Not signed in to DevDiary") {
    super(401, message);
    this.name = "NotSignedInError";
  }
}

// DevDiary works, but the backend's GitHub authorization has expired.
// Diary and todos keep working; GitHub activity needs a fresh sign-in.
class GitHubReauthError extends ApiError {
  constructor(message = "GitHub access expired") {
    super(401, message);
    this.name = "GitHubReauthError";
  }
}

class Api {
  // getServerUrl(): string; getToken(): Promise<string | undefined>
  constructor({ getServerUrl, getToken, fetchImpl = (...args) => globalThis.fetch(...args) }) {
    this.getServerUrl = getServerUrl;
    this.getToken = getToken;
    this.fetch = fetchImpl;
  }

  baseUrl() {
    return this.getServerUrl().replace(/\/+$/, "");
  }

  async request(path, { method = "GET", body, auth = true } = {}) {
    const headers = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (auth) {
      const token = await this.getToken();
      if (!token) throw new NotSignedInError();
      headers.Authorization = `Bearer ${token}`;
    }

    let response;
    try {
      response = await this.fetch(`${this.baseUrl()}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new ApiError(0, `Could not reach DevDiary at ${this.baseUrl()}. Is the server running?`);
    }

    if (response.status === 204) return null;
    const data = await response.json().catch(() => null);
    if (response.ok) return data;

    const message = (data && data.error) || `Request failed (${response.status})`;
    if (response.status === 401 && auth) {
      throw data && data.reauth ? new GitHubReauthError(message) : new NotSignedInError(message);
    }
    throw new ApiError(response.status, message, data);
  }

  // Sign-in
  exchangeCode(code, codeVerifier) {
    return this.request("/auth/vscode/token", {
      method: "POST",
      body: { code, code_verifier: codeVerifier },
      auth: false,
    });
  }
  revokeCurrentToken() {
    return this.request("/auth/tokens/current", { method: "DELETE" });
  }
  me() {
    return this.request("/auth/me");
  }

  // Diary
  listDiary(from, to) {
    return this.request(`/api/diary?from=${from}&to=${to}`);
  }
  // Resolves to null when the day has no entry.
  async getDiary(date) {
    try {
      return await this.request(`/api/diary/date/${date}`);
    } catch (err) {
      if (err.status === 404) return null;
      throw err;
    }
  }
  saveDiary(entryDate, content) {
    return this.request("/api/diary", { method: "POST", body: { entry_date: entryDate, content } });
  }
  deleteDiary(id) {
    return this.request(`/api/diary/${id}`, { method: "DELETE" });
  }

  // Todos
  listTodos() {
    return this.request("/api/todos");
  }
  createTodo(todo) {
    return this.request("/api/todos", { method: "POST", body: todo });
  }
  updateTodo(id, changes) {
    return this.request(`/api/todos/${id}`, { method: "PUT", body: changes });
  }
  deleteTodo(id) {
    return this.request(`/api/todos/${id}`, { method: "DELETE" });
  }

  // GitHub
  activity(date, offset) {
    return this.request(`/api/github/activity?date=${date}&tzOffset=${offset}`);
  }
}

module.exports = { Api, ApiError, NotSignedInError, GitHubReauthError };
