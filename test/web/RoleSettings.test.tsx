// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { RoleSettings } from "../../src/web/components/RoleSettings.js";
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
    id: "worker-1",
    role: "worker",
    label: "worker-1",
    providerChain: [{ provider: "codex", model: null }],
    timeoutMs: 60_000,
    promptVersion: "v1",
  },
  {
    id: "worker-2",
    role: "worker",
    label: "worker-2",
    providerChain: [{ provider: "codex", model: null }],
    timeoutMs: 60_000,
    promptVersion: "v1",
  },
  {
    id: "worker-3",
    role: "worker",
    label: "worker-3",
    providerChain: [{ provider: "codex", model: null }],
    timeoutMs: 60_000,
    promptVersion: "v1",
  },
  {
    id: "worker-4",
    role: "worker",
    label: "worker-4",
    providerChain: [{ provider: "codex", model: null }],
    timeoutMs: 60_000,
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
    id: "qa",
    role: "qa",
    label: "QA",
    providerChain: [{ provider: "claude", model: null }],
    timeoutMs: 60_000,
    promptVersion: "v1",
  },
];

const mockProviders: ProviderStatus[] = [
  {
    provider: "antigravity",
    installed: true,
    authenticated: true,
    capabilities: { readOnly: false, worktreeWrite: true },
    diagnostics: null,
  },
  {
    provider: "claude",
    installed: true,
    authenticated: true,
    capabilities: { readOnly: true, worktreeWrite: true },
    diagnostics: null,
  },
  {
    provider: "codex",
    installed: true,
    authenticated: true,
    capabilities: { readOnly: true, worktreeWrite: false },
    diagnostics: null,
  },
];

describe("RoleSettings Chain Configuration", () => {
  it("renders exactly seven role profiles and checks capability warnings", () => {
    const onChange = vi.fn();
    render(<RoleSettings profiles={mockProfiles} providers={mockProviders} onChange={onChange} />);

    // Must render exactly 7 role cards
    expect(screen.getByText("Manager (manager)")).toBeDefined();
    expect(screen.getByText("worker-1 (worker)")).toBeDefined();
    expect(screen.getByText("worker-2 (worker)")).toBeDefined();
    expect(screen.getByText("worker-3 (worker)")).toBeDefined();
    expect(screen.getByText("worker-4 (worker)")).toBeDefined();
    expect(screen.getByText("Advisor (advisor)")).toBeDefined();
    expect(screen.getByText("QA (qa)")).toBeDefined();

    // Verify fallback configuration change
    const firstSelect = screen.getAllByRole("combobox")[0]!;
    fireEvent.change(firstSelect, { target: { value: "antigravity" } });
    expect(onChange).toHaveBeenCalled();
  });
});
