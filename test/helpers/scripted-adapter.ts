import type {
  ProviderAdapter,
  ProviderRequest,
  ProviderProbeRuntime,
  ProviderStatus,
  BuiltCommand,
  StructuredSchema,
} from "../../src/server/providers/types.js";
import type { ProviderId, ProviderCapabilities } from "../../src/shared/contracts.js";
import * as path from "node:path";

export class ScriptedAdapter implements ProviderAdapter {
  readonly declaredCapabilities: ProviderCapabilities;
  private workerAttempts = new Map<string, number>();

  constructor(
    readonly id: ProviderId,
    public scenario: "success" | "worker_error" | "advisor_blocked" = "success",
  ) {
    this.declaredCapabilities = {
      nonInteractive: true,
      readOnly: id !== "antigravity",
      worktreeWrite: true,
    };
  }

  async probe(runtime: ProviderProbeRuntime, signal: AbortSignal): Promise<ProviderStatus> {
    return {
      provider: this.id,
      installed: true,
      authenticated: true,
      version: "1.0.0",
      models: ["mock-model"],
      capabilities: this.declaredCapabilities,
      diagnostic: null,
      checkedAt: new Date().toISOString(),
    };
  }

  build(
    request: ProviderRequest,
    schema: StructuredSchema | null,
    resultPath: string,
  ): BuiltCommand {
    let mockJSON: any = null;
    let isWorkerWrite = false;
    let targetFilePath = "";
    let targetConstName = "";
    let targetValue = "";
    let exitCode = 0;
    let stderrMsg = "";
    let barrierName = "";

    // 1. Handle Manager Planning
    if (request.outputContract === "manager_plan") {
      barrierName = "planning";
      let commandId = "npx vitest run test/greeting.test.ts";
      try {
        const jsonStart = request.prompt.lastIndexOf('{"draft"');
        if (jsonStart !== -1) {
          const payload = JSON.parse(request.prompt.substring(jsonStart));
          if (Array.isArray(payload.commands) && payload.commands.length > 0) {
            commandId = payload.commands[0];
          }
        }
      } catch (e) {
        // ignore
      }

      mockJSON = {
        summary: "Implement greeting, farewell, and punctuation",
        risks: ["None"],
        testStrategy: ["Run tests"],
        tasks: [
          {
            id: "add-greeting",
            title: "Add greeting file",
            objective: "Create greeting export",
            mode: "write",
            dependsOn: [],
            contextArtifacts: [],
            allowedPaths: ["src/greeting.ts"],
            forbiddenPaths: [],
            acceptanceCriteria: ["greeting exports hello"],
            verificationCommands: [commandId],
          },
          {
            id: "add-farewell",
            title: "Add farewell file",
            objective: "Create farewell export",
            mode: "write",
            dependsOn: [],
            contextArtifacts: [],
            allowedPaths: ["src/farewell.ts"],
            forbiddenPaths: [],
            acceptanceCriteria: ["farewell exports goodbye"],
            verificationCommands: [commandId],
          },
          {
            id: "add-punctuation",
            title: "Add punctuation file",
            objective: "Create punctuation export",
            mode: "write",
            dependsOn: [],
            contextArtifacts: [],
            allowedPaths: ["src/punctuation.ts"],
            forbiddenPaths: [],
            acceptanceCriteria: ["punctuation exports exclamation"],
            verificationCommands: [commandId],
          },
        ],
      };
    }

    // 2. Handle Tech Lead Preflight & Delivery Review
    else if (request.outputContract === "advisor_review") {
      const gate = request.prompt.includes("delivery") ? "delivery" : "preflight";
      barrierName = gate === "delivery" ? "reviewing-delivery" : "reviewing";
      const approve = this.scenario !== "advisor_blocked";

      mockJSON = {
        verdict: approve ? "approve" : "reject",
        blockingFindings: approve ? [] : ["Blocked by Tech Lead policy"],
        requestedChanges: [],
        risks: [],
      };
    }

    // 3. Handle Worker Write
    else if (request.outputContract === "worker_result") {
      const taskId = request.taskId || "unknown";
      if (request.profileId === "worker-1") barrierName = "worker-1";
      if (request.profileId === "worker-2") barrierName = "worker-2";
      if (request.profileId === "worker-3") barrierName = "worker-3";

      if (taskId === "add-farewell" && this.scenario === "worker_error") {
        const attempt = this.workerAttempts.get(taskId) || 0;
        if (attempt === 0) {
          this.workerAttempts.set(taskId, 1);
          exitCode = 1;
          stderrMsg = "quota exceeded";
        }
      }

      if (exitCode === 0) {
        isWorkerWrite = true;
        let file = "";
        let constName = "";
        let val = "";

        if (taskId === "add-greeting") {
          file = "src/greeting.ts";
          constName = "greeting";
          val = "hello";
        } else if (taskId === "add-farewell") {
          file = "src/farewell.ts";
          constName = "farewell";
          val = "goodbye";
        } else if (taskId === "add-punctuation") {
          file = "src/punctuation.ts";
          constName = "punctuation";
          val = "!";
        }

        targetFilePath = path.join(request.cwd, file).replaceAll("\\", "/");
        targetConstName = constName;
        targetValue = val;

        mockJSON = {
          status: "completed",
          summary: `Implemented ${constName}`,
          findings: [],
          changedFiles: [file],
          verification: [],
          risks: [],
        };
      }
    }

    // 4. Handle Delivery Synthesis
    else if (request.outputContract === "delivery_synthesis") {
      mockJSON = {
        summary: "All greeting, farewell, and punctuation features synthesized",
        changedFiles: ["src/greeting.ts", "src/farewell.ts", "src/punctuation.ts"],
        qaSummary: "QA passed completely.",
        remainingRisks: [],
      };
    }

    // 5. Handle Draft Suggestion
    else if (request.outputContract === "draft_suggestion") {
      mockJSON = {
        objective: "Implement greeting, farewell, and punctuation constants",
        scope: ["path:src/greeting.ts", "path:src/farewell.ts", "path:src/punctuation.ts"],
        constraints: [],
        acceptanceCriteria: [
          "greeting exports hello",
          "farewell exports goodbye",
          "punctuation exports exclamation",
        ],
      };
    }

    // 6. Handle Chat
    else {
      mockJSON = {
        message: "Mocked response",
        citedArtifactIds: [],
        draftSuggestion: null,
      };
    }

    // Generate an inline node script execution with barrier checks
    const mockJsonStr = JSON.stringify(mockJSON);
    const escapedResultPath = resultPath.replaceAll("\\", "/");

    let snippet = "";
    if (exitCode !== 0) {
      snippet = `process.stderr.write(${JSON.stringify(stderrMsg)}); process.exit(${exitCode});`;
    } else {
      snippet = `
        const fs = require('fs');
        const path = require('path');

        if (${JSON.stringify(barrierName)}) {
          const barrierPath = path.join(process.env.COZY_DATA_DIR || '', 'data', ${JSON.stringify(barrierName)} + '.barrier');
          while (fs.existsSync(barrierPath)) {
            try {
              require('child_process').execSync('node -e "setTimeout(() => {}, 50)"');
            } catch (e) {}
          }
        }

        if (${isWorkerWrite}) {
          const dir = path.dirname(${JSON.stringify(targetFilePath)});
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(${JSON.stringify(targetFilePath)}, 'export const ${targetConstName} = "${targetValue}";\\n');
        }

        if (${JSON.stringify(escapedResultPath)}) {
          fs.mkdirSync(path.dirname(${JSON.stringify(escapedResultPath)}), { recursive: true });
          fs.writeFileSync(${JSON.stringify(escapedResultPath)}, ${JSON.stringify(mockJsonStr)});
        }

        if (${JSON.stringify(this.id)} === 'claude') {
          console.log(JSON.stringify({ result: ${JSON.stringify(mockJsonStr)} }));
        }
      `;
    }

    return {
      executable: process.execPath,
      args: ["-e", snippet],
      cwd: request.cwd,
      stdin: "",
      structuredResultPath: resultPath,
    };
  }
}
