import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dataDir = fileURLToPath(new URL("../.data/dev", import.meta.url));
await mkdir(dataDir, { recursive: true });

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const commands = [
  [npx, ["tsx", "watch", "src/server/cli.ts"]],
  [npx, ["vite"]],
];
const children = commands.map(([command, args]) =>
  spawn(command, args, {
    cwd: root,
    env: {
      ...process.env,
      COZY_DEV: "1",
      COZY_PORT: "4317",
      COZY_PUBLIC_ORIGIN: "http://127.0.0.1:5173",
      COZY_DATA_DIR: dataDir,
    },
    shell: false,
    stdio: "inherit",
    windowsHide: true,
  }),
);

const stop = () => {
  for (const child of children) child.kill("SIGTERM");
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
const code = await Promise.race(
  children.map(
    (child) => new Promise((resolve) => child.once("exit", (exitCode) => resolve(exitCode ?? 1))),
  ),
);
stop();
process.exitCode = code;
