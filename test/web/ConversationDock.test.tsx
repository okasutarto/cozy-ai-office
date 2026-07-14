// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConversationDock } from "../../src/web/components/ConversationDock.js";
import { AppStoreProvider } from "../../src/web/store.js";
import type { RoleProfile, ProviderStatus } from "../../shared/contracts.js";

const mockProfiles: RoleProfile[] = [
  {
    id: "manager",
    role: "manager",
    label: "Manager",
    providerChain: [{ provider: "claude", model: null }],
    timeoutMs: 120_000,
    promptVersion: "v1",
  },
  {
    id: "advisor",
    role: "advisor",
    label: "Advisor",
    providerChain: [{ provider: "claude", model: null }],
    timeoutMs: 60_000,
    promptVersion: "v1",
  },
  {
    id: "worker-1",
    role: "worker",
    label: "worker-1",
    providerChain: [{ provider: "antigravity", model: null }],
    timeoutMs: 60_000,
    promptVersion: "v1",
  },
];

const mockProviders: ProviderStatus[] = [
  {
    provider: "antigravity",
    installed: true,
    authenticated: true,
    capabilities: { readOnly: false, worktreeWrite: true, nonInteractive: true },
    diagnostics: null,
  },
  {
    provider: "claude",
    installed: true,
    authenticated: true,
    capabilities: { readOnly: true, worktreeWrite: true, nonInteractive: true },
    diagnostics: null,
  },
];

// Valid mock UUIDs
const VALID_PROJECT_ID = "8a604cb7-d0d1-4475-bebe-8df76189ef94";
const VALID_CONV_ID = "3c49ab46-4cb2-4c28-98e3-8aa39f28df19";
const VALID_SNAP_ID = "963d3fb6-787f-44e2-a7cb-df95880df965";
const VALID_MSG_ID = "0c2a2b0e-6f86-455b-80a2-2ab248ea6114";

describe("ConversationDock Component", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.setItem("cozy-session", "test-token");

    // Unified schema-valid fetch stub
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url, options = {}) => {
        const urlStr = String(url);

        // 1. messages list / send message
        if (urlStr.includes("messages")) {
          const mockMsg = {
            id: VALID_MSG_ID,
            conversationId: VALID_CONV_ID,
            sender: "owner",
            body: "Hello Manager",
            sourceMessageIds: [],
            artifactIds: [],
            createdAt: "2026-07-11T12:01:00.000Z",
          };
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(options.method === "POST" ? mockMsg : [mockMsg]),
          });
        }

        // 2. onboarding info
        if (urlStr.includes("onboarding")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ commands: [], roles: mockProfiles }),
          });
        }

        // 3. create conversation / list conversations
        if (urlStr.includes("conversations")) {
          if (options.method === "POST") {
            const body = JSON.parse(options.body || "{}");
            return Promise.resolve({
              ok: true,
              json: () =>
                Promise.resolve({
                  id: VALID_CONV_ID,
                  projectId: VALID_PROJECT_ID,
                  role: body.role || "worker",
                  profileId: body.profileId || "worker-1",
                  contextSnapshotId: VALID_SNAP_ID,
                  runId: null,
                  title: "New Conversation",
                  createdAt: "2026-07-11T12:00:00.000Z",
                  updatedAt: "2026-07-11T12:00:00.000Z",
                }),
            });
          }

          // GET /conversations
          const urlObj = new URL(urlStr, "http://localhost");
          const roleQuery = urlObj.searchParams.get("role") || "manager";
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve([
                {
                  id: VALID_CONV_ID,
                  projectId: VALID_PROJECT_ID,
                  role: roleQuery,
                  profileId: roleQuery,
                  contextSnapshotId: VALID_SNAP_ID,
                  runId: null,
                  title: `${roleQuery} Chat`,
                  createdAt: "2026-07-11T12:00:00.000Z",
                  updatedAt: "2026-07-11T12:00:00.000Z",
                },
              ]),
          });
        }

        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }),
    );
  });

  it("renders with initial tabs, header read-only status and message log", async () => {
    const onDraftCreated = vi.fn();

    render(
      <AppStoreProvider>
        <ConversationDock
          projectId={VALID_PROJECT_ID}
          activeRun={null}
          roleProfiles={mockProfiles}
          providerStatuses={mockProviders}
          contextSnapshotId={VALID_SNAP_ID}
          onDraftCreated={onDraftCreated}
        />
      </AppStoreProvider>,
    );

    // Initial label check
    expect(screen.getByText("Discussion")).toBeDefined();
    expect(screen.getByText("Draft Task")).toBeDefined();
    expect(screen.getByText("Execution")).toBeDefined();

    // Verify read-only chat header and the two exposed discussion personas
    await waitFor(() => {
      expect(screen.getByText("Read-only chat")).toBeDefined();
    });
    expect(screen.getByRole("tab", { name: "Manager" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "Tech Lead" })).toBeDefined();
    expect(screen.queryByText("worker-1")).toBeNull();

    // Check message list renders
    await waitFor(() => {
      expect(screen.getByText("Hello Manager")).toBeDefined();
    });
  });

  it("sends Tech Lead chat through the advisor conversation without a blocking checkbox", async () => {
    const fetchMock = vi.mocked(fetch);
    render(
      <AppStoreProvider>
        <ConversationDock
          projectId={VALID_PROJECT_ID}
          activeRun={null}
          roleProfiles={mockProfiles}
          providerStatuses={mockProviders}
          contextSnapshotId={VALID_SNAP_ID}
          onDraftCreated={vi.fn()}
        />
      </AppStoreProvider>,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Tech Lead" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/projects/${VALID_PROJECT_ID}/conversations`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            role: "advisor",
            profileId: "advisor",
            contextSnapshotId: VALID_SNAP_ID,
            runId: null,
          }),
        }),
      );
    });
    expect(screen.queryByText(/premium token usage warning/u)).toBeNull();

    fireEvent.change(screen.getByLabelText("Composer input"), {
      target: { value: "Review this plan" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/conversations/${VALID_CONV_ID}/messages`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            body: "Review this plan",
            selectedMessageIds: [],
            selectedArtifactIds: [],
            additionalUsageConfirmed: true,
          }),
        }),
      );
    });
  });

  afterEach(cleanup);
});
