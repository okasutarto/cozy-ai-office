import type { ProfileId, RunSnapshot, RunEvent } from "../../shared/contracts.js";
import {
  HOME_STATIONS,
  MEETING_SLOTS,
  STATIONS,
  NAV_GRAPH,
  NAV_ROUTES,
  type Facing,
  type StationName,
} from "./layout.js";

export type CharacterAnimation =
  | "idle.down"
  | "idle.left"
  | "idle.right"
  | "idle.up"
  | "walk.down"
  | "walk.left"
  | "walk.right"
  | "walk.up"
  | "work.up"
  | "read.down"
  | "talk.down"
  | "test.up"
  | "celebrate.down"
  | "error.down";

export type LiveEffect = { kind: "celebrate"; sourceSequence: number } | null;

export type ActorPose = {
  actorId: ProfileId;
  station: StationName;
  position: { x: number; y: number };
  facing: Facing;
  seated: boolean;
  animation: CharacterAnimation;
  sourceSequence: number;
  liveEffect: LiveEffect;
  semanticStatus: string;
  taskId: string | null;
  warning: boolean;
};

const ACTOR_IDS: ProfileId[] = [
  "manager",
  "worker-1",
  "worker-2",
  "worker-3",
  "worker-4",
  "advisor",
  "qa",
];

export function shortestStationPath(from: StationName, to: StationName): StationName[] {
  if (from === to) return [from];
  const queue: StationName[][] = [[from]];
  const visited = new Set<StationName>([from]);
  while (queue.length > 0) {
    const path = queue.shift()!;
    const last = path[path.length - 1]!;
    if (last === to) return path;
    for (const neighbor of NAV_GRAPH[last] || []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push([...path, neighbor]);
      }
    }
  }
  return [from];
}

export function stationRoutePoints(
  from: StationName,
  to: StationName,
): Array<{ x: number; y: number }> {
  const path = shortestStationPath(from, to);
  const points: Array<{ x: number; y: number }> = [];
  for (let index = 0; index < path.length - 1; index++) {
    const current = path[index]!;
    const next = path[index + 1]!;
    let route = NAV_ROUTES[`${current}|${next}`];
    let reverse = false;
    if (!route) {
      route = NAV_ROUTES[`${next}|${current}`];
      reverse = true;
    }
    if (route) {
      const part = reverse ? [...route].reverse() : [...route];
      if (points.length > 0) points.pop();
      points.push(...part);
    }
  }
  if (points.length === 0) points.push(STATIONS[from]);
  return points;
}

function meetingPose(
  actorId: ProfileId,
  run: RunSnapshot | null,
  sourceSequence: number,
): ActorPose {
  const slot = MEETING_SLOTS[actorId];
  const terminal = run && ["failed", "blocked", "cancelled"].includes(run.state);
  const applied = run?.state === "applied";
  let animation: CharacterAnimation = `idle.${slot.facing}`;
  if (terminal) animation = "error.down";
  else if (applied) animation = "celebrate.down";
  else if (actorId === "manager" && run) animation = "talk.down";
  else if (actorId === "advisor" && run) animation = "read.down";

  return {
    actorId,
    station: "meeting",
    position: { x: slot.x, y: slot.y },
    facing: slot.facing,
    seated: false,
    animation,
    sourceSequence,
    liveEffect: applied ? { kind: "celebrate", sourceSequence } : null,
    semanticStatus: run?.state ?? "briefing",
    taskId: null,
    warning: Boolean(terminal),
  };
}

function workingPose(actorId: ProfileId, run: RunSnapshot, sourceSequence: number): ActorPose {
  const station = HOME_STATIONS[actorId];
  const position = STATIONS[station];
  const activeTask = run.tasks.find(
    (task) => task.assignedProfileId === actorId && task.status === "running",
  );
  const seated = actorId !== "advisor";
  let animation: CharacterAnimation = seated ? "idle.up" : "idle.down";
  let semanticStatus = "waiting";

  if (activeTask) {
    animation = "work.up";
    semanticStatus = "working";
  }
  if (actorId === "qa" && run.state === "testing") {
    animation = "test.up";
    semanticStatus = "testing";
  }
  if (actorId === "advisor" && run.state === "advisor_delivery") {
    animation = "read.down";
    semanticStatus = "reviewing";
  }
  if (actorId === "manager" && ["integrating", "testing"].includes(run.state)) {
    animation = "work.up";
    semanticStatus = "integrating";
  }

  return {
    actorId,
    station,
    position: { x: position.x, y: position.y },
    facing: seated ? "up" : "down",
    seated,
    animation,
    sourceSequence,
    liveEffect: null,
    semanticStatus,
    taskId: activeTask?.id ?? null,
    warning: false,
  };
}

export function projectActorPoses(run: RunSnapshot | null, events: RunEvent[]): ActorPose[] {
  const seenSequences = new Set<number>();
  const normalizedEvents = events
    .filter((event) => {
      if (seenSequences.has(event.sequence)) return false;
      seenSequences.add(event.sequence);
      return true;
    })
    .sort((left, right) => left.sequence - right.sequence);
  const sourceSequence = normalizedEvents.at(-1)?.sequence ?? 0;
  const gathering =
    !run ||
    [
      "planned",
      "advisor_preflight",
      "ready_to_apply",
      "applied",
      "failed",
      "blocked",
      "cancelled",
    ].includes(run.state);

  const poses = ACTOR_IDS.map((actorId) =>
    gathering
      ? meetingPose(actorId, run, sourceSequence)
      : workingPose(actorId, run, sourceSequence),
  );

  for (const event of normalizedEvents) {
    if (event.kind !== "task.failed" || !event.actorId || gathering) continue;
    const pose = poses.find((item) => item.actorId === event.actorId);
    if (pose) {
      pose.animation = "error.down";
      pose.warning = true;
      pose.semanticStatus = "error";
    }
  }
  return poses;
}
