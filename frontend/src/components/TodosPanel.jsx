import { useEffect, useState } from "react";
import { api } from "../api";
import { dueMoment, formatDue, toLocalInputValue } from "../dates";
import Icon from "./Icon";

// datetime-local value ("YYYY-MM-DDTHH:mm", local time) → UTC ISO, or null.
function inputToIso(value) {
  return value ? new Date(value).toISOString() : null;
}

function TodoForm({ initial, submitLabel, onSubmit, onCancel }) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [due, setDue] = useState(initial?.due_date ? toLocalInputValue(initial.due_date) : "");
  const [link, setLink] = useState(initial?.linked_url ?? "");
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
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="todo-form" onSubmit={submit}>
      <label className="form-group">
        <span className="form-label">Title</span>
        <input
          className="form-control"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What do you need to do?"
          autoFocus
        />
      </label>
      <div className="todo-form-row">
        <label className="form-group">
          <span className="form-label">
            <Icon name="clock" /> Due
          </span>
          <input className="form-control" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
        <label className="form-group grow">
          <span className="form-label">
            <Icon name="link" /> Linked issue or PR <span className="muted">(optional)</span>
          </span>
          <input
            className="form-control"
            type="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://github.com/owner/repo/issues/1"
          />
        </label>
      </div>
      {error && <p className="flash flash-error">{error}</p>}
      <div className="form-actions">
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy || !title.trim()}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

function TodoRow({ todo, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const overdue = !todo.done && todo.due_date && dueMoment(todo.due_date) < new Date();

  if (editing) {
    return (
      <li className="box-row todo-row editing">
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
    <li className={`box-row todo-row${todo.done ? " done" : ""}`}>
      <button
        type="button"
        className={`todo-state ${todo.done ? "closed" : "open"}`}
        onClick={() => onUpdate(todo, { done: !todo.done })}
        aria-label={todo.done ? `Reopen "${todo.title}"` : `Close "${todo.title}"`}
        title={todo.done ? "Reopen" : "Mark as done"}
      >
        <Icon name={todo.done ? "issueClosed" : "issueOpened"} />
      </button>
      <div className="todo-main">
        <span className="todo-title">{todo.title}</span>
        <div className="todo-meta">
          {overdue && <span className="label label-danger">Overdue</span>}
          {todo.due_date && (
            <span className="todo-meta-item">
              <Icon name="clock" size={12} /> Due {formatDue(todo.due_date)}
            </span>
          )}
          {todo.reminder_sent_at && !todo.done && (
            <span className="todo-meta-item">
              <Icon name="bell" size={12} /> Reminder sent
            </span>
          )}
          {todo.linked_url && (
            <a href={todo.linked_url} target="_blank" rel="noreferrer" className="todo-meta-item todo-link">
              <Icon name="link" size={12} />
              {todo.linked_url.replace(/^https?:\/\/(www\.)?(github\.com\/)?/, "")}
            </a>
          )}
          {!todo.due_date && !todo.linked_url && <span className="todo-meta-item">No due date</span>}
        </div>
      </div>
      <div className="todo-actions">
        <button type="button" className="btn btn-sm btn-invisible icon-btn" onClick={() => setEditing(true)} aria-label="Edit todo">
          <Icon name="pencil" />
        </button>
        <button type="button" className="btn btn-sm btn-invisible icon-btn" onClick={() => onDelete(todo)} aria-label="Delete todo">
          <Icon name="trash" />
        </button>
      </div>
    </li>
  );
}

export default function TodosPanel({ remindersActive, onOpenCountChange }) {
  const [todos, setTodos] = useState([]);
  const [filter, setFilter] = useState("open");
  const [adding, setAdding] = useState(false);
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

  const openCount = todos.filter((t) => !t.done).length;
  const closedCount = todos.length - openCount;

  useEffect(() => {
    if (loaded) onOpenCountChange?.(openCount);
  }, [loaded, openCount, onOpenCountChange]);

  async function create(todo) {
    await api.createTodo(todo);
    setAdding(false);
    setFilter("open");
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
    if (!window.confirm(`Delete "${todo.title}"?`)) return;
    try {
      await api.deleteTodo(todo.id);
      setTodos((prev) => prev.filter((t) => t.id !== todo.id));
    } catch (err) {
      setError(err.message);
    }
  }

  const visible = todos.filter((t) => (filter === "closed" ? t.done : !t.done));

  return (
    <section aria-labelledby="todos-heading">
      <div className="section-header">
        <h2 id="todos-heading" className="section-title">
          Todos
        </h2>
        <button type="button" className="btn btn-primary" onClick={() => setAdding((a) => !a)}>
          <Icon name="plus" /> New todo
        </button>
      </div>

      {!remindersActive && (
        <p className="flash flash-warn">
          <Icon name="bell" /> Add a reminder email in Settings to get emailed when todos are due.
        </p>
      )}
      {error && <p className="flash flash-error">{error}</p>}

      {adding && (
        <div className="box new-todo">
          <div className="box-body">
            <TodoForm submitLabel="Create todo" onSubmit={create} onCancel={() => setAdding(false)} />
          </div>
        </div>
      )}

      <div className="box">
        <div className="box-header list-header">
          <button
            type="button"
            className="list-filter"
            aria-pressed={filter === "open"}
            onClick={() => setFilter("open")}
          >
            <Icon name="issueOpened" /> {openCount} Open
          </button>
          <button
            type="button"
            className="list-filter"
            aria-pressed={filter === "closed"}
            onClick={() => setFilter("closed")}
          >
            <Icon name="check" /> {closedCount} Done
          </button>
        </div>
        <ul className="todo-list">
          {visible.map((todo) => (
            <TodoRow key={todo.id} todo={todo} onUpdate={update} onDelete={remove} />
          ))}
        </ul>
        {loaded && visible.length === 0 && (
          <div className="blankslate">
            <Icon name={filter === "closed" ? "issueClosed" : "issueOpened"} size={24} />
            <h3>{filter === "closed" ? "Nothing done yet" : "You're all caught up"}</h3>
            <p>{filter === "closed" ? "Completed todos show up here." : "Create a todo to plan work that isn't tied to any repo."}</p>
          </div>
        )}
      </div>
    </section>
  );
}
