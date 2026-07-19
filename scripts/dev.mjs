import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const isWindows = process.platform === "win32";
const pythonCandidates = isWindows
  ? [path.join(root, ".venv", "Scripts", "python.exe"), "python"]
  : [path.join(root, ".venv", "bin", "python"), "python3"];
const python = pythonCandidates.find((candidate) => !path.isAbsolute(candidate) || existsSync(candidate));

if (!python) {
  console.error("Python environment not found. Create .venv and install requirements.txt first.");
  process.exit(1);
}

const viteEntry = path.join(root, "node_modules", "vite", "bin", "vite.js");
if (!existsSync(viteEntry)) {
  console.error("Vite is not installed. Run npm install first.");
  process.exit(1);
}

const children = [];
let stopping = false;

function stop(signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }
}

function watch(child) {
  children.push(child);
  child.on("error", (error) => {
    console.error(error.message);
    process.exitCode = 1;
    stop();
  });
  child.on("exit", (code, signal) => {
    if (stopping) return;
    process.exitCode = code ?? (signal ? 1 : 0);
    stop();
  });
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForApi() {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (stopping) throw new Error("Development services stopped before the API became ready.");
    try {
      const response = await fetch("http://127.0.0.1:8001/health");
      if (response.ok) return;
    } catch {
      // Model initialization takes a few seconds; keep polling until it is ready.
    }
    await delay(400);
  }
  throw new Error("Python API did not become ready within 60 seconds.");
}

watch(spawn(python, ["-m", "uvicorn", "backend.app:app", "--host", "127.0.0.1", "--port", "8001"], {
  cwd: root,
  stdio: "inherit",
  detached: !isWindows
}));

console.log("Starting the Python analysis API...");
try {
  await waitForApi();
  console.log("Analysis API ready. Starting the web interface...");
  watch(spawn(process.execPath, [viteEntry, "--host", "127.0.0.1", "--port", "8000"], {
    cwd: root,
    stdio: "inherit",
    detached: !isWindows
  }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
  stop();
}
