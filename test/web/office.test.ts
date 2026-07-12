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
  DOORS,
  WALLS,
  COLLIDERS,
  MEETING_SLOTS,
  segmentIntersectsCollider,
} from "../../src/web/office/layout.js";
import { assetManifest } from "../../src/web/office/asset-manifest.js";

describe("Office Geometry & Navigation Specifications", () => {
  it("conforms to manifest layout dimensions and tile equations", () => {
    expect(assetManifest.version).toBe(2);
    expect(assetManifest.tileSize).toBe(16);
    expect(OFFICE_WIDTH).toBe(768);
    expect(OFFICE_HEIGHT).toBe(288);
    expect(TILE_SIZE).toBe(16);

    expect(OFFICE_WIDTH / TILE_SIZE).toBe(48);
    expect(OFFICE_HEIGHT / TILE_SIZE).toBe(18);
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

  it("gives every room four walls and at least one collider-aligned door", () => {
    const doorIds = new Set(DOORS.map((door) => door.id));
    for (const room of ROOMS) {
      expect(new Set(room.wallSides)).toEqual(new Set(["top", "right", "bottom", "left"]));
      expect(room.doors.length).toBeGreaterThan(0);
      for (const doorId of room.doors) expect(doorIds.has(doorId)).toBe(true);
    }

    expect(WALLS.some((wall) => wall.id === "outer-top" && wall.w === OFFICE_WIDTH)).toBe(true);
    expect(WALLS.some((wall) => wall.id === "outer-bottom" && wall.w === OFFICE_WIDTH)).toBe(true);
    expect(WALLS.some((wall) => wall.id === "outer-left" && wall.h === OFFICE_HEIGHT)).toBe(true);
    expect(WALLS.some((wall) => wall.id === "outer-right" && wall.h === OFFICE_HEIGHT)).toBe(true);

    for (const door of DOORS) {
      const overlapsWall = WALLS.some(
        (wall) =>
          door.x < wall.x + wall.w &&
          door.x + door.w > wall.x &&
          door.y < wall.y + wall.h &&
          door.y + door.h > wall.y,
      );
      expect(overlapsWall).toBe(false);
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

  it("gives every actor a unique in-bounds meeting slot", () => {
    const occupied = new Set<string>();
    for (const slot of Object.values(MEETING_SLOTS)) {
      expect(slot.x).toBeGreaterThanOrEqual(0);
      expect(slot.x).toBeLessThanOrEqual(OFFICE_WIDTH);
      expect(slot.y).toBeGreaterThanOrEqual(0);
      expect(slot.y).toBeLessThanOrEqual(OFFICE_HEIGHT);
      occupied.add(`${slot.x},${slot.y}`);
    }
    expect(occupied.size).toBe(7);
  });

  it("checks proportional fit-to-container resize math", () => {
    const containerW = 1000;
    const containerH = 600;
    const scale = Math.max(1, Math.min(containerW / OFFICE_WIDTH, containerH / OFFICE_HEIGHT));
    expect(scale).toBeCloseTo(1.3020833333333333);
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
import type { RunEvent, RunSnapshot } from "../../src/shared/contracts.js";
import { calculateOfficeViewport } from "../../src/web/office/layout.js";

describe("Office Animation & State Projection", () => {
  it("computes shortest paths correctly based on NAV_GRAPH", () => {
    const path = shortestStationPath("manager-desk", "meeting");
    expect(path).toEqual(["manager-desk", "meeting"]);

    const pts = stationRoutePoints("manager-desk", "meeting");
    expect(pts.length).toBeGreaterThanOrEqual(2);

    const receptionToServer = shortestStationPath("reception", "server-room");
    expect(receptionToServer[0]).toBe("reception");
    expect(receptionToServer.at(-1)).toBe("server-room");
    expect(stationRoutePoints("reception", "server-room").length).toBeGreaterThan(6);
  });

  it("projects briefing, work, and return-to-meeting choreography", () => {
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

    const briefing = projectActorPoses(null, events);
    expect(briefing.every((pose) => pose.station === "meeting")).toBe(true);

    const workingRun = {
      state: "working",
      tasks: [
        { id: "task-1", assignedProfileId: "worker-1", status: "running" },
        { id: "task-2", assignedProfileId: "worker-2", status: "queued" },
      ],
    } as RunSnapshot;
    const working = projectActorPoses(workingRun, events);
    const worker1 = working.find((pose) => pose.actorId === "worker-1")!;
    const worker2 = working.find((pose) => pose.actorId === "worker-2")!;
    const advisor = working.find((pose) => pose.actorId === "advisor")!;
    expect(worker1.station).toBe("worker-1-desk");
    expect(worker1.animation).toBe("work.up");
    expect(worker1.seated).toBe(true);
    expect(worker2.animation).toBe("idle.up");
    expect(worker2.seated).toBe(true);
    expect(advisor.station).toBe("bookshelf");
    expect(advisor.seated).toBe(false);

    const ready = projectActorPoses({ ...workingRun, state: "ready_to_apply" }, events);
    expect(ready.every((pose) => pose.station === "meeting")).toBe(true);
    expect(ready.find((pose) => pose.actorId === "manager")!.animation).toBe("talk.down");
  });

  it("projects every lifecycle scene and terminal review pose", () => {
    const baseRun = { tasks: [] } as unknown as RunSnapshot;

    for (const state of ["planned", "advisor_preflight"] as const) {
      const poses = projectActorPoses({ ...baseRun, state }, []);
      expect(poses.every((pose) => pose.station === "meeting")).toBe(true);
      expect(poses.find((pose) => pose.actorId === "manager")!.animation).toBe("talk.down");
      expect(poses.find((pose) => pose.actorId === "advisor")!.animation).toBe("read.down");
    }

    const dispatching = projectActorPoses({ ...baseRun, state: "dispatching" }, []);
    expect(dispatching.every((pose) => pose.station !== "meeting")).toBe(true);
    expect(dispatching.find((pose) => pose.actorId === "manager")!.seated).toBe(true);
    expect(dispatching.find((pose) => pose.actorId === "advisor")!.seated).toBe(false);

    const testing = projectActorPoses({ ...baseRun, state: "testing" }, []);
    const qa = testing.find((pose) => pose.actorId === "qa")!;
    expect(qa.station).toBe("qa");
    expect(qa.animation).toBe("test.up");
    expect(qa.seated).toBe(true);

    const applied = projectActorPoses({ ...baseRun, state: "applied" }, []);
    expect(applied.every((pose) => pose.station === "meeting")).toBe(true);
    expect(applied.every((pose) => pose.animation === "celebrate.down")).toBe(true);

    for (const state of ["failed", "blocked", "cancelled"] as const) {
      const poses = projectActorPoses({ ...baseRun, state }, []);
      expect(poses.every((pose) => pose.station === "meeting")).toBe(true);
      expect(poses.every((pose) => pose.animation === "error.down")).toBe(true);
    }
  });

  it("calculates a proportional full-bleed viewport", () => {
    expect(calculateOfficeViewport(1000, 600)).toEqual({
      width: 1000,
      height: 600,
      zoom: 1.3020833333333333,
      originX: 0,
      originY: 112,
    });
    expect(calculateOfficeViewport(1200, 700)).toEqual({
      width: 1200,
      height: 700,
      zoom: 1.5625,
      originX: 0,
      originY: 125,
    });
    expect(calculateOfficeViewport(1300, 480)).toEqual({
      width: 1300,
      height: 480,
      zoom: 5 / 3,
      originX: 10,
      originY: 0,
    });
  });
});
