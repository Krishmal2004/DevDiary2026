import { useEffect, useState } from "react";
import { api } from "../api";
import { dueMoment, formatDue, toLocalInputValue } from "../dates";

const FILTERS = [
  ["open", "Open"],
  ["done", "Done"],
  ["all", "All"],
];

// datetime-local value ("YYYY-MM-DDTHH:mm", local time) → UTC ISO, or null.
function inputToIso(value) {
  return value ? new Date(value).toISOString() : null;
}

function TodoForm({ initial, submitLabel, onSubmit, onCancel }) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [due, setDue] = useState(initial?.due_date ? toLocalInputValue(initial.due_date) : "");
  const [link, setLink] = useState(initial?.linked_url ?? "");
  const [showLink, setShowLink] = useState(!!initial?.linked_url);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ title: title.trim(), due_date: inputToIso(due), linked_url: link.trim() || null });
      if (!initial) {
        setTitle("");
        setDue("");
        setLink("");
        setShowLink(false);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="todo-form" onSubmit={submit}>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What do you need to do?"
        aria-label="Todo title"
        autoFocus={!!initial}
      />
      <div className="todo-form-row">
        <label className="field-inline">
          <span>Due</span>
          <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
        {showLink ? (
          <input
            type="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://github.com/owner/repo/issues/1"
            aria-label="Linked issue or PR URL"
            className="grow"
          />
        ) : (
          <button type="button" className="link-button" onClick={() => setShowLink(true)}>
            + Link issue/PR
          </button>
        )}
      </div>
      {error && <p className="notice error">{error}</p>}
      <div className="todo-form-actions">
        {onCancel && (
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" disabled={busy || !title.trim()}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

function TodoItem({ todo, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const overdue = !todo.done && todo.due_date && dueMoment(todo.due_date) < new Date();

  if (editing) {
    return (
      <li className="todo-item editing">
        <TodoForm
          initial={todo}
          submitLabel="Save"
          onSubmit={async (changes) => {
            await onUpdate(todo, changes);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className={`todo-item${todo.done ? " done" : ""}`}>
      <input
        type="checkbox"
        checked={!!todo.done}
        onChange={() => onUpdate(todo, { done: !todo.done })}
        aria-label={`Mark "${todo.title}" as ${todo.done ? "not done" : "done"}`}
      />
      <div className="todo-body">
        <span className="todo-title">{todo.title}</span>
        <div className="todo-meta">
          {todo.due_date && (
            <span className={`badge${overdue ? " overdue" : ""}`}>
              {overdue ? "Overdue · " : ""}
              {formatDue(todo.due_date)}
            </span>
          )}
          {todo.reminder_sent_at && !todo.done && <span className="badge muted">Reminder sent</span>}
          {todo.linked_url && (
            <a href={todo.linked_url} target="_blank" rel="noreferrer" className="todo-link">
              {todo.linked_url.replace(/^https?:\/\/(www\.)?(github\.com\/)?/, "")}
            </a>
          )}
        </div>
      </div>
      <div className="todo-actions">
        <button type="button" className="icon-button" onClick={() => setEditing(true)} aria-label="Edit todo">
          ✎
        </button>
        <button type="button" className="icon-button" onClick={() => onDelete(todo)} aria-label="Delete todo">
          ×
        </button>
      </div>
    </li>
  );
}

export default function TodosPanel({ remindersActive }) {
  const [todos, setTodos] = useState([]);
  const [filter, setFilter] = useState("open");
  const [error, setError] = useState(null);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    try {
      setTodos(await api.listTodos());
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function create(todo) {
    await api.createTodo(todo);
    await load();
  }

  async function update(todo, changes) {
    try {
      await api.updateTodo(todo.id, changes);
      await load();
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }

  async function remove(todo) {
    try {
      await api.deleteTodo(todo.id);
      setTodos((prev) => prev.filter((t) => t.id !== todo.id));
    } catch (err) {
      setError(err.message);
    }
  }

  const openCount = todos.filter((t) => !t.done).length;
  const visible = todos.filter((t) => filter === "all" || (filter === "done" ? t.done : !t.done));

  return (
    <section className="panel todos-panel" aria-labelledby="todos-heading">
      <div className="panel-header">
        <h2 id="todos-heading">Todos</h2>
        <div className="segmented" role="tablist">
          {FILTERS.map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={filter === key} onClick={() => setFilter(key)}>
              {label}
              {key === "open" && openCount > 0 ? ` (${openCount})` : ""}
            </button>
          ))}
        </div>
      </div>

      <TodoForm submitLabel="Add todo" onSubmit={create} />
      {!remindersActive && (
        <p className="notice info">Add your email in Settings to get reminders when todos are due.</p>
      )}
      {error && <p className="notice error">{error}</p>}

      <ul className="todo-list">
        {visible.map((todo) => (
          <TodoItem key={todo.id} todo={todo} onUpdate={update} onDelete={remove} />
        ))}
        {loaded && visible.length === 0 && (
          <li className="empty">{filter === "done" ? "Nothing completed yet." : "You're all caught up."}</li>
        )}
      </ul>
    </section>
  );
}
