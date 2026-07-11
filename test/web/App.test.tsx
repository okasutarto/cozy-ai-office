// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { App } from "../../src/web/App.js";
import { AppStoreProvider } from "../../src/web/store.js";

describe("App Container", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    window.location.hash = "";
  });

  it("renders missing session screen when no token exists", () => {
    render(
      <AppStoreProvider>
        <App />
      </AppStoreProvider>,
    );

    expect(screen.getByText(/Missing Session/u)).toBeDefined();
    expect(screen.getByText(/npx cozy-agent-office/u)).toBeDefined();
  });

  it("extracts session token from hash, stores it, clears location.hash, and calls bootstrap", async () => {
    window.location.hash = "#session=test-secret-token-abcdef123456";

    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            projects: [],
            providers: [],
            activeRun: null,
          }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AppStoreProvider>
        <App />
      </AppStoreProvider>,
    );

    // Verify token moves to sessionStorage and disappears from hash
    await waitFor(() => {
      expect(sessionStorage.getItem("cozy-session")).toBe("test-secret-token-abcdef123456");
      expect(window.location.hash).toBe("");
    });

    // Token should never enter localStorage or visible DOM
    expect(localStorage.getItem("cozy-session")).toBeNull();
    expect(screen.queryByText("test-secret-token-abcdef123456")).toBeNull();

    // Verify fetch contains Authorization header
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bootstrap",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer test-secret-token-abcdef123456",
        }),
      }),
    );
  });
});
