import { useEffect, useState } from "react";
import "./App.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

function App() {
  const [todos, setTodos] = useState([]);
  const [diaryEntries, setDiaryEntries] = useState([]);
  const [newTodo, setNewTodo] = useState("");
  const [error, setError] = useState(null);

  async function loadData() {
    try {
      const [todosRes, diaryRes] = await Promise.all([
        fetch(`${API_BASE}/api/todos`),
        fetch(`${API_BASE}/api/diary`),
      ]);
      setTodos(await todosRes.json());
      setDiaryEntries(await diaryRes.json());
      setError(null);
    } catch (err) {
      setError("Could not reach the backend. Is it running on " + API_BASE + "?");
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function addTodo(e) {
    e.preventDefault();
    if (!newTodo.trim()) return;
    await fetch(`${API_BASE}/api/todos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTodo }),
    });
    setNewTodo("");
    loadData();
  }

  async function toggleTodo(todo) {
    await fetch(`${API_BASE}/api/todos/${todo.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !todo.done }),
    });
    loadData();
  }

  return (
    <main className="dashboard">
      <h1>DevDiary2026</h1>
      {error && <p className="error">{error}</p>}

      <section>
        <h2>Todos</h2>
        <form onSubmit={addTodo} className="todo-form">
          <input
            type="text"
            value={newTodo}
            onChange={(e) => setNewTodo(e.target.value)}
            placeholder="What do you need to do?"
          />
          <button type="submit">Add</button>
        </form>
        <ul className="todo-list">
          {todos.map((todo) => (
            <li key={todo.id}>
              <label>
                <input
                  type="checkbox"
                  checked={!!todo.done}
                  onChange={() => toggleTodo(todo)}
                />
                <span className={todo.done ? "done" : ""}>{todo.title}</span>
              </label>
              {todo.due_date && <span className="due">due {todo.due_date}</span>}
            </li>
          ))}
          {todos.length === 0 && <li className="empty">No todos yet.</li>}
        </ul>
      </section>

      <section>
        <h2>Diary</h2>
        <ul className="diary-list">
          {diaryEntries.map((entry) => (
            <li key={entry.id}>
              <strong>{entry.entry_date}</strong>
              <p>{entry.content}</p>
            </li>
          ))}
          {diaryEntries.length === 0 && <li className="empty">No entries yet.</li>}
        </ul>
      </section>
    </main>
  );
}

export default App;
