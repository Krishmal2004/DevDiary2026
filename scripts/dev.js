// Runs the backend and the Vite dev server together, prefixing each line of
// output with its source. Ctrl+C stops both.
const { spawn } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const processes = [
  { name: "backend ", cwd: path.join(root, "backend") },
  { name: "frontend", cwd: path.join(root, "frontend") },
].map(({ name, cwd }) => {
  const child = spawn("npm", ["run", "dev"], { cwd, shell: true, stdio: ["ignore", "pipe", "pipe"] });
  const prefix = (stream, out) => {
    let buffer = "";
    stream.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) out.write(`[${name}] ${line}\n`);
    });
  };
  prefix(child.stdout, process.stdout);
  prefix(child.stderr, process.stderr);
  child.on("exit", (code) => {
    console.log(`[${name}] exited with code ${code}`);
    shutdown(code ?? 0);
  });
  return child;
});

let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const child of processes) child.kill();
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
