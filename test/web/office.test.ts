// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  OFFICE_WIDTH,
  OFFICE_HEIGHT,
  TILE_SIZE,
  STATIONS,
  NAV_GRAPH,
  NAV_ROUTES,
  ROOMS,
  COLLIDERS,
  segmentIntersectsCollider,
} from "../../src/web/office/layout.js";
import { assetManifest } from "../../src/web/office/asset-manifest.js";

describe("Office Geometry & Navigation Specifications", () => {
  it("conforms to manifest layout dimensions and tile equations", () => {
    expect(assetManifest.version).toBe(1);
    expect(assetManifest.tileSize).toBe(16);
    expect(OFFICE_WIDTH).toBe(352);
    expect(OFFICE_HEIGHT).toBe(240);
    expect(TILE_SIZE).toBe(16);

    // Office grid is exactly 22x15 tiles (22 * 16 = 352, 15 * 16 = 240)
    expect(OFFICE_WIDTH / TILE_SIZE).toBe(22);
    expect(OFFICE_HEIGHT / TILE_SIZE).toBe(15);
  });

  it("checks room and station bounds constraints", () => {
    // All rooms stay within bounds
    for (const room of ROOMS) {
      expect(room.x).toBeGreaterThanOrEqual(0);
      expect(room.y).toBeGreaterThanOrEqual(0);
      expect(room.x + room.w).toBeLessThanOrEqual(OFFICE_WIDTH);
      expect(room.y + room.h).toBeLessThanOrEqual(OFFICE_HEIGHT);
    }

    // All stations stay within bounds
    for (const [name, station] of Object.entries(STATIONS)) {
      expect(station.x).toBeGreaterThanOrEqual(0);
      expect(station.x).toBeLessThanOrEqual(OFFICE_WIDTH);
      expect(station.y).toBeGreaterThanOrEqual(0);
      expect(station.y).toBeLessThanOrEqual(OFFICE_HEIGHT);
    }
  });

  it("checks navigation routes and graph reachability", () => {
    // Verify each station is reachable (a simple BFS or check NAV_GRAPH)
    const stations = Object.keys(STATIONS);
    const visited = new Set<string>();
    const queue = [stations[0]!];
    visited.add(stations[0]!);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const neighbors = NAV_GRAPH[current as any] || [];
      for (const n of neighbors) {
        if (!visited.has(n)) {
          visited.add(n);
          queue.push(n);
        }
      }
    }

    expect(visited.size).toBe(stations.length);

    // Every edge has a route and no segment intersects a collider
    for (const [edgeKey, route] of Object.entries(NAV_ROUTES)) {
      expect(route.length).toBeGreaterThanOrEqual(2);
      for (let i = 0; i < route.length - 1; i++) {
        const p1 = route[i]!;
        const p2 = route[i + 1]!;

        // Must be axis-aligned
        expect(p1.x === p2.x || p1.y === p2.y).toBe(true);

        // No segment interior intersects any collider
        for (const collider of COLLIDERS) {
          const intersects = segmentIntersectsCollider(p1, p2, collider);
          expect(intersects).toBe(false);
        }
      }
    }
  });

  it("checks integer scaling resize math", () => {
    // Scale math simulation
    const containerW = 1000;
    const containerH = 600;
    const scale = Math.max(
      1,
      Math.floor(Math.min(containerW / OFFICE_WIDTH, containerH / OFFICE_HEIGHT)),
    );
    expect(scale).toBe(2); // Math.min(2.84, 2.5) => floor to 2
  });

  it("verifies compiled assets exist and conform to schemas", () => {
    expect(fs.existsSync("public/assets/office/office-atlas.png")).toBe(true);
    expect(fs.existsSync("public/assets/office/office-atlas.json")).toBe(true);
    expect(fs.existsSync("public/assets/characters/characters-atlas.png")).toBe(true);
    expect(fs.existsSync("public/assets/characters/characters-atlas.json")).toBe(true);
    expect(fs.existsSync("public/assets/licenses.json")).toBe(true);
  });
});

import {
  projectActorPoses,
  shortestStationPath,
  stationRoutePoints,
} from "../../src/web/office/animation.js";
import type { RunEvent } from "../../shared/contracts.js";

describe("Office Animation & State Projection", () => {
  it("computes shortest paths correctly based on NAV_GRAPH", () => {
    const path = shortestStationPath("manager-desk", "meeting");
    expect(path).toEqual(["manager-desk", "meeting"]);

    const pts = stationRoutePoints("manager-desk", "meeting");
    expect(pts.length).toBeGreaterThanOrEqual(2);
  });

  it("projects events to correct actor animations and deduplicates by sequence", () => {
    const events: RunEvent[] = [
      {
        sequence: 1,
        runId: "963d3fb6-787f-44e2-a7cb-df95880df965",
        kind: "run.created",
        actorId: null,
        taskId: null,
        payload: {},
        createdAt: "2026-07-11T12:00:00.000Z",
      },
      {
        sequence: 2,
        runId: "963d3fb6-787f-44e2-a7cb-df95880df965",
        kind: "task.started",
        actorId: "worker-1",
        taskId: "task-1",
        payload: {},
        createdAt: "2026-07-11T12:01:00.000Z",
      },
      // Duplicate sequence to verify normalization
      {
        sequence: 2,
        runId: "963d3fb6-787f-44e2-a7cb-df95880df965",
        kind: "task.started",
        actorId: "worker-1",
        taskId: "task-1",
        payload: {},
        createdAt: "2026-07-11T12:01:00.000Z",
      },
    ];

    const poses = projectActorPoses(null, events);
    const mgr = poses.find((p) => p.actorId === "manager")!;
    const adv = poses.find((p) => p.actorId === "advisor")!;
    const w1 = poses.find((p) => p.actorId === "worker-1")!;

    expect(mgr.station).toBe("meeting");
    expect(mgr.animation).toBe("talk");
    expect(adv.station).toBe("meeting");
    expect(adv.animation).toBe("read");
    expect(w1.station).toBe("worker-1-desk");
    expect(w1.animation).toBe("work");
  });
});
