import type { ProfileId, RunSnapshot, RunEvent } from "../../shared/contracts.js";
import { STATIONS, NAV_GRAPH, NAV_ROUTES } from "./layout.js";

export type CharacterAnimation =
  | "idle"
  | "walk.down"
  | "walk.left"
  | "walk.right"
  | "walk.up"
  | "work"
  | "read"
  | "talk"
  | "test"
  | "celebrate"
  | "error";

export type LiveEffect = {
  kind: "celebrate";
  sourceSequence: number;
} | null;

export type ActorPose = {
  actorId: ProfileId;
  station: keyof typeof STATIONS;
  animation: CharacterAnimation;
  sourceSequence: number;
  liveEffect: LiveEffect;
  semanticStatus: string;
  taskId: string | null;
  warning: boolean;
};

export function shortestStationPath(
  from: keyof typeof STATIONS,
  to: keyof typeof STATIONS,
): Array<keyof typeof STATIONS> {
  if (from === to) return [from];
  const queue: Array<keyof typeof STATIONS>[] = [[from]];
  const visited = new Set<string>([from]);

  while (queue.length > 0) {
    const path = queue.shift()!;
    const last = path[path.length - 1]!;
    if (last === to) return path;

    const neighbors = NAV_GRAPH[last] || [];
    for (const n of neighbors) {
      if (!visited.has(n)) {
        visited.add(n);
        queue.push([...path, n]);
      }
    }
  }
  return [from];
}

export function stationRoutePoints(
  from: keyof typeof STATIONS,
  to: keyof typeof STATIONS,
): Array<{ x: number; y: number }> {
  const path = shortestStationPath(from, to);
  const points: { x: number; y: number }[] = [];

  for (let i = 0; i < path.length - 1; i++) {
    const u = path[i]!;
    const v = path[i + 1]!;

    let route = NAV_ROUTES[`${u}|${v}`];
    let reverse = false;
    if (!route) {
      route = NAV_ROUTES[`${v}|${u}`];
      reverse = true;
    }

    if (route) {
      const part = reverse ? [...route].reverse() : [...route];
      if (points.length > 0 && part.length > 0) {
        points.pop();
      }
      points.push(...part);
    }
  }

  if (points.length === 0) {
    points.push(STATIONS[from]);
  }
  return points;
}

export function projectActorPoses(run: RunSnapshot | null, events: RunEvent[]): ActorPose[] {
  const poses: Record<ProfileId, ActorPose> = {
    manager: {
      actorId: "manager",
      station: "manager-desk",
      animation: "idle",
      sourceSequence: 0,
      liveEffect: null,
      semanticStatus: "idle",
      taskId: null,
      warning: false,
    },
    "worker-1": {
      actorId: "worker-1",
      station: "worker-1-desk",
      animation: "idle",
      sourceSequence: 0,
      liveEffect: null,
      semanticStatus: "idle",
      taskId: null,
      warning: false,
    },
    "worker-2": {
      actorId: "worker-2",
      station: "worker-2-desk",
      animation: "idle",
      sourceSequence: 0,
      liveEffect: null,
      semanticStatus: "idle",
      taskId: null,
      warning: false,
    },
    "worker-3": {
      actorId: "worker-3",
      station: "worker-3-desk",
      animation: "idle",
      sourceSequence: 0,
      liveEffect: null,
      semanticStatus: "idle",
      taskId: null,
      warning: false,
    },
    "worker-4": {
      actorId: "worker-4",
      station: "worker-4-desk",
      animation: "idle",
      sourceSequence: 0,
      liveEffect: null,
      semanticStatus: "idle",
      taskId: null,
      warning: false,
    },
    advisor: {
      actorId: "advisor",
      station: "bookshelf",
      animation: "idle",
      sourceSequence: 0,
      liveEffect: null,
      semanticStatus: "idle",
      taskId: null,
      warning: false,
    },
    qa: {
      actorId: "qa",
      station: "qa",
      animation: "idle",
      sourceSequence: 0,
      liveEffect: null,
      semanticStatus: "idle",
      taskId: null,
      warning: false,
    },
  };

  const sortedEvents = [...events]
    .filter((e, idx, self) => self.findIndex((x) => x.sequence === e.sequence) === idx)
    .sort((a, b) => a.sequence - b.sequence);

  sortedEvents.forEach((event) => {
    const actorId = event.actorId;
    const kind = event.kind;

    if (kind === "run.created") {
      poses["manager"] = {
        ...poses["manager"],
        station: "meeting",
        animation: "talk",
        sourceSequence: event.sequence,
      };
      poses["advisor"] = {
        ...poses["advisor"],
        station: "meeting",
        animation: "read",
        sourceSequence: event.sequence,
      };
    } else if (kind === "consultation.started" && actorId) {
      poses[actorId] = {
        ...poses[actorId],
        station: "bookshelf",
        animation: "read",
        sourceSequence: event.sequence,
      };
    } else if ((kind === "task.started" || kind === "attempt.started") && actorId) {
      poses[actorId] = {
        ...poses[actorId],
        station: `${actorId}-desk` as any,
        animation: "work",
        sourceSequence: event.sequence,
        taskId: event.taskId,
      };
    } else if (kind === "integration.started") {
      const workerId = actorId || "manager";
      poses[workerId] = {
        ...poses[workerId],
        station: "integration",
        animation: "work",
        sourceSequence: event.sequence,
      };
    } else if (kind === "qa.command.started") {
      poses["qa"] = {
        ...poses["qa"],
        station: "qa",
        animation: "test",
        sourceSequence: event.sequence,
      };
    } else if (kind === "advisor.gate") {
      poses["advisor"] = {
        ...poses["advisor"],
        station: "bookshelf",
        animation: "read",
        sourceSequence: event.sequence,
      };
    } else if (kind === "task.failed" && actorId) {
      poses[actorId] = {
        ...poses[actorId],
        animation: "error",
        warning: true,
        sourceSequence: event.sequence,
      };
    } else if (kind === "run.failed" || kind === "run.blocked") {
      const affected = actorId || "manager";
      poses[affected] = {
        ...poses[affected],
        animation: "error",
        warning: true,
        sourceSequence: event.sequence,
      };
    } else if (kind === "task.finished" && actorId) {
      poses[actorId] = {
        ...poses[actorId],
        station: `${actorId}-desk` as any,
        animation: "celebrate",
        liveEffect: { kind: "celebrate", sourceSequence: event.sequence },
        sourceSequence: event.sequence,
      };
    } else if (kind === "integration.finished") {
      const workerId = actorId || "manager";
      poses[workerId] = {
        ...poses[workerId],
        station: `${workerId}-desk` as any,
        animation: "celebrate",
        liveEffect: { kind: "celebrate", sourceSequence: event.sequence },
        sourceSequence: event.sequence,
      };
    } else if (kind === "run.applied") {
      Object.keys(poses).forEach((id) => {
        poses[id as ProfileId] = {
          ...poses[id as ProfileId],
          animation: "celebrate",
          liveEffect: { kind: "celebrate", sourceSequence: event.sequence },
          sourceSequence: event.sequence,
        };
      });
    }
  });

  if (run) {
    const activeActorIds = new Set<string>();
    run.tasks.forEach((t) => {
      if (t.status === "running" && t.assignedProfileId) {
        activeActorIds.add(t.assignedProfileId);
      }
    });

    ["worker-1", "worker-2", "worker-3", "worker-4"].forEach((id) => {
      if (!activeActorIds.has(id)) {
        const pose = poses[id as ProfileId];
        if (pose.station === `${id}-desk` && pose.animation === "idle") {
          poses[id as ProfileId] = {
            ...pose,
            station: "coffee",
            animation: "idle",
          };
        }
      }
    });
  }

  return Object.values(poses);
}
