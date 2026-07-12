// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Onboarding } from "../../src/web/components/Onboarding.js";
import { ApiClient } from "../../src/web/api.js";
import { AppStoreProvider } from "../../src/web/store.js";

const providers = [
  {
    provider: "antigravity" as const,
    installed: true,
    authenticated: false,
    version: "1.0.0",
    models: ["mock-model"],
    capabilities: { readOnly: false, worktreeWrite: true, nonInteractive: true },
    diagnostic: "Login required",
    checkedAt: "2026-07-11T12:00:00.000Z",
  },
  {
    provider: "claude" as const,
    installed: true,
    authenticated: true,
    version: "1.0.0",
    models: ["mock-model"],
    capabilities: { readOnly: true, worktreeWrite: true, nonInteractive: true },
    diagnostic: null,
    checkedAt: "2026-07-11T12:00:00.000Z",
  },
  {
    provider: "codex" as const,
    installed: true,
    authenticated: true,
    version: "1.0.0",
    models: ["mock-model"],
    capabilities: { readOnly: true, worktreeWrite: true, nonInteractive: true },
    diagnostic: null,
    checkedAt: "2026-07-11T12:00:00.000Z",
  },
];

const project = {
  id: "00000000-0000-4000-8000-000000000123",
  name: "my-repo",
  rootPath: "C:/my-repo",
  setupComplete: false,
  updatedAt: "2026-07-11T12:00:00.000Z",
};

const command = {
  id: "discovered-test",
  label: "test",
  executable: "cmd.exe",
  args: ["/d", "/s", "/c", "npm.cmd run test"],
  cwd: "." as const,
  required: true,
  timeoutMs: 300_000,
};

const selectResponse = {
  ...project,
  branch: "main",
  head: "a".repeat(40),
  clean: true,
  statusEntries: [],
  trackedPaths: ["package.json"],
  commandCandidates: [command],
  rulePaths: [],
  diagnostic: null,
};

const mockBootstrap = {
  projects: [],
  providers,
  activeRun: null,
};

function makeApi() {
  const api = new ApiClient("test-token");
  const request = vi.spyOn(api, "request").mockImplementation(async (path, init = {}) => {
    if (path === "/api/projects/select") return selectResponse as any;
    if (path === `/api/projects/${project.id}/onboarding`) {
      return { project, commands: [command], roles: [], contextSnapshotId: null } as any;
    }
    if (path === `/api/projects/${project.id}/context-candidates`) {
      return { candidates: ["package.json"], excluded: [] } as any;
    }
    if (path === `/api/projects/${project.id}/providers/probe`) return providers as any;
    if (path === `/api/projects/${project.id}/providers/antigravity/verify-login`) {
      return { ...providers[0], authenticated: true, diagnostic: null } as any;
    }
    if (path === "/api/bootstrap")
      return { projects: [{ ...project, setupComplete: true }], providers, activeRun: null } as any;
    if (path.includes("context-snapshots")) {
      return {
        id: "00000000-0000-4000-8000-000000000124",
        projectId: project.id,
        sourceBranch: "main",
        sourceHead: "a".repeat(40),
        manifestHash: "b".repeat(64),
        entries: [{ path: "package.json", sizeBytes: 20, sha256: "c".repeat(64) }],
        excluded: [],
        createdAt: "2026-07-11T12:00:00.000Z",
      } as any;
    }
    return {} as any;
  });
  return { api, request };
}

describe("Onboarding Wizard Component", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(cleanup);

  it("verifies a clean repository, probes providers, and uses the real Antigravity consent route", async () => {
    const { api, request } = makeApi();
    render(
      <AppStoreProvider>
        <Onboarding bootstrap={mockBootstrap} api={api} />
      </AppStoreProvider>,
    );

    fireEvent.change(screen.getByLabelText(/Repository Absolute Path/u), {
      target: { value: "C:/my-repo" },
    });
    fireEvent.click(screen.getByText(/Verify Repository Path/u));
    await screen.findByText(/Clean root/u);
    fireEvent.click(screen.getByRole("button", { name: /LLM Engines/u }));
    fireEvent.click(screen.getByRole("button", { name: /Probe official CLIs/u }));
    await screen.findByText(/Probe complete/u);

    const phrase = screen.getByLabelText(/Verify login/u);
    fireEvent.change(phrase, { target: { value: "USE SUBSCRIPTION TURN" } });
    fireEvent.click(screen.getByRole("button", { name: /Verify Antigravity login/u }));

    await waitFor(() => {
      expect(request).toHaveBeenCalledWith(
        `/api/projects/${project.id}/providers/antigravity/verify-login`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ model: null, confirmation: "USE SUBSCRIPTION TURN" }),
        }),
      );
    });
  });

  it("uses verification commands discovered by repository inspection", async () => {
    const { api } = makeApi();
    render(
      <AppStoreProvider>
        <Onboarding bootstrap={mockBootstrap} api={api} />
      </AppStoreProvider>,
    );

    fireEvent.change(screen.getByLabelText(/Repository Absolute Path/u), {
      target: { value: "C:/my-repo" },
    });
    fireEvent.click(screen.getByText(/Verify Repository Path/u));
    await screen.findByText(/Clean root/u);
    fireEvent.click(screen.getByRole("button", { name: /LLM Engines/u }));
    fireEvent.click(screen.getByRole("button", { name: /Probe official CLIs/u }));
    await screen.findByText(/Probe complete/u);
    fireEvent.click(screen.getByRole("button", { name: /Test Suites & Context/u }));

    expect(screen.getByText("discovered-test")).toBeDefined();
  });
});
