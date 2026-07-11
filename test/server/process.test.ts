import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ProcessSupervisor, sanitizedChildEnv } from "../../src/server/system/process.js";

const fixture = fileURLToPath(new URL("../fixtures/fake-provider.mjs", import.meta.url));

function memorySink() {
  let value = "";
  return {
    write: async (chunk: string) => {
      value += chunk;
    },
    value: () => value,
  };
}

describe("ProcessSupervisor", () => {
  it("strips API and app tokens while preserving CLI auth locations", () => {
    expect(
      sanitizedChildEnv({
        OPENAI_API_KEY: "secret",
        COZY_SESSION_TOKEN: "secret",
        HOME: "/home/test",
        APPDATA: "C:/Users/test/AppData/Roaming",
      }),
    ).toEqual({ HOME: "/home/test", APPDATA: "C:/Users/test/AppData/Roaming" });
  });

  it("uses stdin and keeps stdout and stderr separate", async () => {
    const stdout = memorySink();
    const stderr = memorySink();
    const result = await new ProcessSupervisor().run(
      {
        executable: process.execPath,
        args: [fixture, "stdin"],
        cwd: process.cwd(),
        stdin: "hello",
        timeoutMs: 5_000,
      },
      { stdout, stderr },
      new AbortController().signal,
    );
    expect(result.exitCode).toBe(0);
    expect(stdout.value()).toBe("hello");
    expect(stderr.value()).toBe("");
  });

  it("marks a timed-out process and terminates it", async () => {
    const result = await new ProcessSupervisor({ terminateGraceMs: 50 }).run(
      {
        executable: process.execPath,
        args: [fixture, "sleep", "5000"],
        cwd: process.cwd(),
        stdin: "",
        timeoutMs: 25,
      },
      { stdout: memorySink(), stderr: memorySink() },
      new AbortController().signal,
    );
    expect(result.timedOut).toBe(true);
    expect(result.durationMs).toBeLessThan(2_000);
  });

  it("marks an aborted process as cancelled", async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 25);
    const result = await new ProcessSupervisor({ terminateGraceMs: 50 }).run(
      {
        executable: process.execPath,
        args: [fixture, "sleep", "5000"],
        cwd: process.cwd(),
        stdin: "",
        timeoutMs: 5_000,
      },
      { stdout: memorySink(), stderr: memorySink() },
      controller.signal,
    );
    expect(result.cancelled).toBe(true);
  });

  it("returns ENOENT without an unhandled child error", async () => {
    const result = await new ProcessSupervisor().run(
      {
        executable: `cozy-missing-executable-${process.pid}`,
        args: [],
        cwd: process.cwd(),
        stdin: "",
        timeoutMs: 1_000,
      },
      { stdout: memorySink(), stderr: memorySink() },
      new AbortController().signal,
    );
    expect(result.spawnErrorCode).toBe("ENOENT");
  });

  it("terminates the spawned process tree", async () => {
    const stdout = memorySink();
    await new ProcessSupervisor({ terminateGraceMs: 50 }).run(
      {
        executable: process.execPath,
        args: [fixture, "child"],
        cwd: process.cwd(),
        stdin: "",
        timeoutMs: 50,
      },
      { stdout, stderr: memorySink() },
      new AbortController().signal,
    );
    const grandchildPid = Number(stdout.value());
    expect(Number.isInteger(grandchildPid)).toBe(true);
    await expect
      .poll(() => {
        try {
          process.kill(grandchildPid, 0);
          return true;
        } catch {
          return false;
        }
      })
      .toBe(false);
  });
});
