// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Onboarding } from "../../src/web/components/Onboarding.js";
import { ApiClient } from "../../src/web/api.js";
import { AppStoreProvider } from "../../src/web/store.js";

const mockBootstrap = {
  projects: [],
  providers: [
    {
      provider: "antigravity" as const,
      installed: true,
      authenticated: false,
      capabilities: { readOnly: true, worktreeWrite: true },
      diagnostics: "Diagnostics details",
    },
    {
      provider: "claude" as const,
      installed: true,
      authenticated: true,
      capabilities: { readOnly: true, worktreeWrite: true },
      diagnostics: null,
    },
  ],
  activeRun: null,
};

describe("Onboarding Wizard Component", () => {
  let api: ApiClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    api = new ApiClient("test-token");
  });

  it("advances steps, accepts repo path, and verifies antigravity card login", async () => {
    const requestMock = vi.fn().mockImplementation((path) => {
      if (path === "/api/projects") {
        return Promise.resolve({
          id: "proj-123",
          name: "my-repo",
          branch: "main",
          head: "abcdef",
        });
      }
      if (path === "/api/providers/antigravity/verify") {
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({});
    });
    vi.spyOn(api, "request").mockImplementation(requestMock);

    render(
      <AppStoreProvider>
        <Onboarding bootstrap={mockBootstrap} api={api} />
      </AppStoreProvider>,
    );

    // Step 1: Repo Path
    const input = screen.getByLabelText(/Repository Absolute Path/u) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "C:/my-repo" } });
    expect(input.value).toBe("C:/my-repo");

    const verifyBtn = screen.getByText(/Verify Repository Path/u);
    fireEvent.click(verifyBtn);

    await waitFor(() => {
      expect(screen.getByText(/Clean root/u)).toBeDefined();
    });

    // Go to step 2 (Providers)
    fireEvent.click(screen.getByText("Next"));

    // Verify Provider diagnostics cards
    expect(screen.getByText("antigravity")).toBeDefined();
    expect(screen.getByText(/Verify login/u)).toBeDefined();

    // Verify Antigravity verify flow requires exact phrase
    const verifyPhraseInput = screen.getByLabelText(/Verify login/u);
    fireEvent.change(verifyPhraseInput, { target: { value: "wrong phrase" } });

    const providerVerifyBtn = screen.getByRole("button", { name: "Verify" });
    fireEvent.click(providerVerifyBtn);

    await waitFor(() => {
      expect(screen.getByText(/Exact confirmation phrase required/u)).toBeDefined();
    });

    // Enter correct phrase
    fireEvent.change(verifyPhraseInput, { target: { value: "verify login" } });
    fireEvent.click(providerVerifyBtn);

    await waitFor(() => {
      expect(requestMock).toHaveBeenCalledWith(
        "/api/providers/antigravity/verify",
        expect.any(Object),
      );
    });
  });
});
