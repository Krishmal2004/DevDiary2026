// Thin wrapper around fetch for the DevDiary2026 backend. In development the
// Vite dev server proxies /api and /auth to the backend (see vite.config.js),
// so relative URLs work and the session cookie is same-origin.
export const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

export class ApiError extends Error {
  constructor(status, message, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function request(path, { method = "GET", body } = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: "include",
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Could not reach the backend. Is it running?");
  }

  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status, data?.error || `Request failed (${response.status})`, data);
  }
  return data;
}

export const loginUrl = `${API_BASE}/auth/github`;

export const api = {
  me: () => request("/auth/me"),
  updateMe: (changes) => request("/auth/me", { method: "PATCH", body: changes }),
  logout: () => request("/auth/logout", { method: "POST" }),

  listDiary: (from, to) => request(`/api/diary?from=${from}&to=${to}`),
  saveDiary: (entry_date, content) => request("/api/diary", { method: "POST", body: { entry_date, content } }),
  deleteDiary: (id) => request(`/api/diary/${id}`, { method: "DELETE" }),

  listTodos: () => request("/api/todos"),
  createTodo: (todo) => request("/api/todos", { method: "POST", body: todo }),
  updateTodo: (id, changes) => request(`/api/todos/${id}`, { method: "PUT", body: changes }),
  deleteTodo: (id) => request(`/api/todos/${id}`, { method: "DELETE" }),

  repos: () => request("/api/github/repos"),
  repo: (fullName) => request(`/api/github/repos/${fullName}`),

  activity: (date) =>
    request(`/api/github/activity?date=${date}&tzOffset=${new Date(`${date}T12:00:00`).getTimezoneOffset()}`),
};
