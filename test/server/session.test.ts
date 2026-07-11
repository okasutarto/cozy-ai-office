import { describe, expect, it } from "vitest";
import WebSocketClient from "ws";
import { buildApp } from "../../src/server/app.js";
import { createTestDependencies } from "../helpers/test-dependencies.js";

describe("local session security", () => {
  it("rejects API requests without the server token", async () => {
    const dependencies = await createTestDependencies();
    const app = await buildApp(dependencies);
    try {
      const response = await app.inject({ method: "GET", url: "/api/bootstrap" });
      expect(response.statusCode).toBe(401);
    } finally {
      await app.close();
      await dependencies.close();
    }
  });

  it("rejects a mismatched browser origin", async () => {
    const dependencies = await createTestDependencies();
    const app = await buildApp(dependencies);
    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/bootstrap",
        headers: {
          authorization: `Bearer ${dependencies.config.sessionToken}`,
          origin: "https://attacker.example",
        },
      });
      expect(response.statusCode).toBe(403);
    } finally {
      await app.close();
      await dependencies.close();
    }
  });

  it("accepts the exact token and loopback origin", async () => {
    const dependencies = await createTestDependencies();
    const app = await buildApp(dependencies);
    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/bootstrap",
        headers: {
          authorization: `Bearer ${dependencies.config.sessionToken}`,
          origin: dependencies.config.publicOrigin,
        },
      });
      expect(response.statusCode).toBe(200);
    } finally {
      await app.close();
      await dependencies.close();
    }
  });
});

describe("WebSocket upgrade and auth flows", () => {
  it("verifies websocket security constraints", async () => {
    const dependencies = await createTestDependencies();
    dependencies.config.websocketAuthTimeoutMs = 50;
    const app = await buildApp(dependencies);

    // Start Fastify on loopback and port 0
    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address() as any;
    const port = address.port;
    const wsUrl = `ws://127.0.0.1:${port}/ws`;

    // Helpers to track clients
    const clientsToClose: WebSocketClient[] = [];
    const addClient = (ws: WebSocketClient) => {
      clientsToClose.push(ws);
      return ws;
    };

    try {
      // 1. Mismatched origin gets 403
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocketClient(wsUrl, {
          headers: { origin: "https://attacker.example" },
        });
        addClient(ws);
        ws.on("open", () => {
          reject(new Error("Should not have opened connection with attacker origin"));
        });
        ws.on("unexpected-response", (req, res) => {
          if (res.statusCode === 403) {
            resolve();
          } else {
            reject(new Error(`Expected 403, got ${res.statusCode}`));
          }
        });
        ws.on("error", () => {
          // Some WS implementations fail with error on 403
          resolve();
        });
      });

      // 2. Auth timeout closed with 4401
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocketClient(wsUrl, {
          headers: { origin: dependencies.config.publicOrigin },
        });
        addClient(ws);
        ws.on("close", (code) => {
          if (code === 4401) {
            resolve();
          } else {
            reject(new Error(`Expected close code 4401, got ${code}`));
          }
        });
        ws.on("error", reject);
      });

      // 3. Exact Origin plus wrong token closes with 4401
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocketClient(wsUrl, {
          headers: { origin: dependencies.config.publicOrigin },
        });
        addClient(ws);
        ws.on("message", (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === "challenge") {
            ws.send(
              JSON.stringify({
                type: "auth",
                token: "wrong-token-value-here-which-is-long",
                nonce: msg.nonce,
              }),
            );
          }
        });
        ws.on("close", (code) => {
          if (code === 4401) {
            resolve();
          } else {
            reject(new Error(`Expected close code 4401, got ${code}`));
          }
        });
        ws.on("error", reject);
      });

      // 4. Exact Origin plus correct token and current nonce receives authenticated
      let savedChallengeNonce = "";
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocketClient(wsUrl, {
          headers: { origin: dependencies.config.publicOrigin },
        });
        addClient(ws);
        ws.on("message", (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === "challenge") {
            savedChallengeNonce = msg.nonce;
            ws.send(
              JSON.stringify({
                type: "auth",
                token: dependencies.config.sessionToken,
                nonce: msg.nonce,
              }),
            );
          } else if (msg.type === "authenticated") {
            resolve();
          }
        });
        ws.on("error", reject);
      });

      // 5. Replaying the old nonce on a second socket closes with 4401
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocketClient(wsUrl, {
          headers: { origin: dependencies.config.publicOrigin },
        });
        addClient(ws);
        ws.on("message", (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === "challenge") {
            ws.send(
              JSON.stringify({
                type: "auth",
                token: dependencies.config.sessionToken,
                nonce: savedChallengeNonce, // Replay old nonce
              }),
            );
          }
        });
        ws.on("close", (code) => {
          if (code === 4401) {
            resolve();
          } else {
            reject(new Error(`Expected close code 4401, got ${code}`));
          }
        });
        ws.on("error", reject);
      });

      // 6. Three malformed frames close with 4400
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocketClient(wsUrl, {
          headers: { origin: dependencies.config.publicOrigin },
        });
        addClient(ws);
        let errorCount = 0;
        ws.on("message", (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === "challenge") {
            ws.send("not-json-1");
            ws.send("not-json-2");
            ws.send("not-json-3");
          } else if (msg.type === "error" && msg.code === "malformed_frame") {
            errorCount++;
          }
        });
        ws.on("close", (code) => {
          if (code === 4400) {
            resolve();
          } else {
            reject(new Error(`Expected close code 4400, got ${code}`));
          }
        });
        ws.on("error", reject);
      });
    } finally {
      clientsToClose.forEach((ws) => {
        if (
          ws.readyState === WebSocketClient.OPEN ||
          ws.readyState === WebSocketClient.CONNECTING
        ) {
          ws.terminate();
        }
      });
      await app.close();
      await dependencies.close();
    }
  });
});
