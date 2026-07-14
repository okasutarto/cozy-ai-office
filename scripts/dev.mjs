import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dataDir = fileURLToPath(new URL("../.data/dev", import.meta.url));
await mkdir(dataDir, { recursive: true });

const serverPort = process.env.COZY_PORT || "4317";
const webPort = process.env.COZY_WEB_PORT || "5173";
const node = process.execPath;
const tsxCli = fileURLToPath(new URL("../node_modules/tsx/dist/cli.mjs", import.meta.url));
const viteCli = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url));
const commands = [
  [node, [tsxCli, "watch", "src/server/cli.ts"]],
  [node, [viteCli]],
];
const children = commands.map(([command, args]) =>
  spawn(command, args, {
    cwd: root,
    env: {
      ...process.env,
      COZY_DEV: "1",
      COZY_PORT: serverPort,
      COZY_PUBLIC_ORIGIN: `http://127.0.0.1:${webPort}`,
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
