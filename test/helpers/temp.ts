import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function withTempDir<T>(run: (path: string) => Promise<T>): Promise<T> {
  const path = await mkdtemp(join(tmpdir(), "cozy-agent-office-"));
  try {
    return await run(path);
  } finally {
    let retries = 5;
    while (retries > 0) {
      try {
        await rm(path, { recursive: true, force: true });
        break;
      } catch (err) {
        retries--;
        if (retries === 0) throw err;
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    }
  }
}
