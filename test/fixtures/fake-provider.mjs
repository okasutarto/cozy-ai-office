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
} else {
  process.stderr.write(`unknown mode:${mode}`);
  process.exitCode = 2;
}
