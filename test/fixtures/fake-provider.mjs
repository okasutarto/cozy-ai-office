import { spawn } from "node:child_process";

const [mode, value = ""] = process.argv.slice(2);
if (mode === "echo") {
  process.stdout.write(value);
  process.stderr.write(`stderr:${value}`);
} else if (mode === "sleep") {
  setTimeout(() => process.stdout.write("finished"), Number(value));
} else if (mode === "exit") {
  process.stderr.write(`exit:${value}`);
  process.exitCode = Number(value);
} else if (mode === "child") {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    stdio: "ignore",
    windowsHide: true,
  });
  process.stdout.write(String(child.pid));
  setInterval(() => {}, 1000);
} else if (mode === "stdin") {
  let input = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => (input += chunk));
  process.stdin.on("end", () => process.stdout.write(input));
} else if (mode === "version") {
  process.stdout.write(value || "fake-provider 1.0.0");
} else if (mode === "auth-ok") {
  process.stdout.write(JSON.stringify({ authenticated: true }));
} else if (mode === "auth-fail") {
  process.stderr.write("authentication required");
  process.exitCode = 1;
} else if (mode === "json") {
  process.stdout.write(JSON.stringify(JSON.parse(value)));
} else if (mode === "quota") {
  process.stderr.write("quota exceeded");
  process.exitCode = 1;
} else if (mode === "invalid-json") {
  process.stdout.write("not-json");
} else {
  process.stderr.write(`unknown mode:${mode}`);
  process.exitCode = 2;
}
