import type { ProfileId } from "../../shared/contracts.js";

export const OFFICE_WIDTH = 768;
export const OFFICE_HEIGHT = 288;
export const TILE_SIZE = 16;
export const CORE_OFFSET_X = 128;

export type OfficeViewport = {
  width: number;
  height: number;
  zoom: number;
  originX: number;
  originY: number;
};

export function calculateOfficeViewport(
  containerWidth: number,
  containerHeight: number,
): OfficeViewport {
  const width = Math.max(1, Math.floor(containerWidth));
  const height = Math.max(1, Math.floor(containerHeight));
  const zoom = Math.max(1, Math.min(width / OFFICE_WIDTH, height / OFFICE_HEIGHT));
  return {
    width,
    height,
    zoom,
    originX: Math.floor((width - OFFICE_WIDTH * zoom) / 2),
    originY: Math.floor((height - OFFICE_HEIGHT * zoom) / 2),
  };
}

export const STATIONS = {
  reception: { x: 80, y: 224 },
  "manager-desk": { x: 384, y: 64 },
  meeting: { x: 320, y: 112 },
  bookshelf: { x: 496, y: 80 },
  "worker-1-desk": { x: 384, y: 144 },
  "worker-2-desk": { x: 448, y: 144 },
  "worker-3-desk": { x: 512, y: 144 },
  "worker-4-desk": { x: 576, y: 144 },
  coffee: { x: 576, y: 240 },
  integration: { x: 240, y: 224 },
  qa: { x: 576, y: 64 },
  "server-room": { x: 704, y: 112 },
} as const;

export type StationName = keyof typeof STATIONS;
export type Facing = "down" | "left" | "right" | "up";

export const MEETING_SLOTS: Record<ProfileId, { x: number; y: number; facing: Facing }> = {
  advisor: { x: 200, y: 48, facing: "down" },
  manager: { x: 232, y: 48, facing: "down" },
  qa: { x: 264, y: 48, facing: "down" },
  "worker-1": { x: 200, y: 128, facing: "up" },
  "worker-2": { x: 232, y: 128, facing: "up" },
  "worker-3": { x: 264, y: 128, facing: "up" },
  "worker-4": { x: 296, y: 128, facing: "up" },
};

export const HOME_STATIONS: Record<ProfileId, StationName> = {
  manager: "manager-desk",
  "worker-1": "worker-1-desk",
  "worker-2": "worker-2-desk",
  "worker-3": "worker-3-desk",
  "worker-4": "worker-4-desk",
  advisor: "bookshelf",
  qa: "qa",
};

export const NAV_GRAPH: Record<StationName, StationName[]> = {
  reception: ["integration"],
  "manager-desk": ["meeting", "bookshelf"],
  meeting: ["manager-desk", "worker-1-desk", "integration"],
  bookshelf: ["manager-desk", "worker-2-desk", "qa"],
  "worker-1-desk": ["meeting", "worker-2-desk"],
  "worker-2-desk": ["worker-1-desk", "worker-3-desk", "bookshelf"],
  "worker-3-desk": ["worker-2-desk", "worker-4-desk"],
  "worker-4-desk": ["worker-3-desk", "qa", "coffee"],
  coffee: ["worker-4-desk", "integration"],
  integration: ["meeting", "coffee", "reception"],
  qa: ["bookshelf", "worker-4-desk", "server-room"],
  "server-room": ["qa"],
};

export const NAV_ROUTES: Record<string, { x: number; y: number }[]> = {
  "reception|integration": [STATIONS.reception, { x: 128, y: 224 }, STATIONS.integration],
  "manager-desk|meeting": [
    STATIONS["manager-desk"],
    { x: 384, y: 80 },
    { x: 352, y: 80 },
    { x: 352, y: 112 },
    STATIONS.meeting,
  ],
  "manager-desk|bookshelf": [STATIONS["manager-desk"], { x: 384, y: 80 }, STATIONS.bookshelf],
  "meeting|worker-1-desk": [
    STATIONS.meeting,
    { x: 352, y: 112 },
    { x: 352, y: 144 },
    STATIONS["worker-1-desk"],
  ],
  "meeting|integration": [
    STATIONS.meeting,
    { x: 304, y: 112 },
    { x: 304, y: 160 },
    { x: 240, y: 160 },
    STATIONS.integration,
  ],
  "bookshelf|worker-2-desk": [
    STATIONS.bookshelf,
    { x: 464, y: 80 },
    { x: 464, y: 144 },
    STATIONS["worker-2-desk"],
  ],
  "bookshelf|qa": [STATIONS.bookshelf, { x: 544, y: 80 }, { x: 544, y: 64 }, STATIONS.qa],
  "worker-1-desk|worker-2-desk": [STATIONS["worker-1-desk"], STATIONS["worker-2-desk"]],
  "worker-2-desk|worker-3-desk": [STATIONS["worker-2-desk"], STATIONS["worker-3-desk"]],
  "worker-3-desk|worker-4-desk": [STATIONS["worker-3-desk"], STATIONS["worker-4-desk"]],
  "worker-4-desk|qa": [
    STATIONS["worker-4-desk"],
    { x: 544, y: 144 },
    { x: 544, y: 64 },
    STATIONS.qa,
  ],
  "worker-4-desk|coffee": [
    STATIONS["worker-4-desk"],
    { x: 544, y: 144 },
    { x: 544, y: 192 },
    { x: 544, y: 224 },
    { x: 576, y: 224 },
    STATIONS.coffee,
  ],
  "coffee|integration": [STATIONS.coffee, { x: 576, y: 224 }, STATIONS.integration],
  "qa|server-room": [
    STATIONS.qa,
    { x: 608, y: 64 },
    { x: 608, y: 112 },
    { x: 640, y: 112 },
    STATIONS["server-room"],
  ],
};

export type RoomDefinition = {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  wallSides: readonly ["top", "right", "bottom", "left"];
  doors: readonly string[];
};

const ALL_WALL_SIDES = ["top", "right", "bottom", "left"] as const;

export const ROOMS: RoomDefinition[] = [
  {
    name: "reception",
    x: 0,
    y: 0,
    w: 128,
    h: 288,
    wallSides: ALL_WALL_SIDES,
    doors: ["reception-corridor"],
  },
  {
    name: "meeting-room",
    x: 128,
    y: 0,
    w: 208,
    h: 192,
    wallSides: ALL_WALL_SIDES,
    doors: ["meeting-right", "meeting-bottom"],
  },
  {
    name: "open-office",
    x: 336,
    y: 0,
    w: 288,
    h: 192,
    wallSides: ALL_WALL_SIDES,
    doors: ["meeting-right", "workspace-corridor", "break-top", "server-left"],
  },
  {
    name: "south-corridor",
    x: 128,
    y: 192,
    w: 352,
    h: 96,
    wallSides: ALL_WALL_SIDES,
    doors: ["reception-corridor", "meeting-bottom", "workspace-corridor", "break-left"],
  },
  {
    name: "break-room",
    x: 480,
    y: 192,
    w: 144,
    h: 96,
    wallSides: ALL_WALL_SIDES,
    doors: ["break-top", "break-left"],
  },
  {
    name: "server-room",
    x: 624,
    y: 0,
    w: 144,
    h: 288,
    wallSides: ALL_WALL_SIDES,
    doors: ["server-left"],
  },
];

export const DOORS = [
  { id: "reception-corridor", x: 112, y: 208, w: 16, h: 32 },
  { id: "meeting-right", x: 320, y: 96, w: 16, h: 32 },
  { id: "meeting-bottom", x: 224, y: 176, w: 32, h: 16 },
  { id: "workspace-corridor", x: 400, y: 176, w: 32, h: 16 },
  { id: "break-top", x: 528, y: 176, w: 32, h: 16 },
  { id: "break-left", x: 464, y: 208, w: 16, h: 32 },
  { id: "server-left", x: 624, y: 96, w: 16, h: 32 },
] as const;

export const WALLS = [
  { id: "outer-top", x: 0, y: 0, w: 768, h: 16 },
  { id: "outer-left", x: 0, y: 0, w: 16, h: 288 },
  { id: "outer-right", x: 752, y: 0, w: 16, h: 288 },
  { id: "outer-bottom", x: 0, y: 272, w: 768, h: 16 },
  { id: "reception-right-top", x: 112, y: 16, w: 16, h: 192 },
  { id: "reception-right-bottom", x: 112, y: 240, w: 16, h: 32 },
  { id: "meeting-right-top", x: 320, y: 16, w: 16, h: 80 },
  { id: "meeting-right-bottom", x: 320, y: 128, w: 16, h: 64 },
  { id: "meeting-bottom-left", x: 128, y: 176, w: 96, h: 16 },
  { id: "meeting-bottom-right", x: 256, y: 176, w: 80, h: 16 },
  { id: "workspace-bottom-left", x: 336, y: 176, w: 64, h: 16 },
  { id: "workspace-bottom-middle", x: 432, y: 176, w: 96, h: 16 },
  { id: "workspace-bottom-right", x: 560, y: 176, w: 64, h: 16 },
  { id: "break-left-top", x: 464, y: 192, w: 16, h: 16 },
  { id: "break-left-bottom", x: 464, y: 240, w: 16, h: 32 },
  { id: "server-left-top", x: 624, y: 16, w: 16, h: 80 },
  { id: "server-left-bottom", x: 624, y: 128, w: 16, h: 144 },
] as const;

export const FURNITURE_COLLIDERS = [
  { x: 32, y: 80, w: 64, h: 32 },
  { x: 176, y: 48, w: 96, h: 48 },
  { x: 368, y: 32, w: 32, h: 16 },
  { x: 368, y: 112, w: 32, h: 16 },
  { x: 432, y: 112, w: 32, h: 16 },
  { x: 496, y: 112, w: 32, h: 16 },
  { x: 560, y: 112, w: 32, h: 16 },
  { x: 480, y: 48, w: 32, h: 16 },
  { x: 560, y: 32, w: 32, h: 16 },
  { x: 592, y: 224, w: 32, h: 16 },
  { x: 656, y: 32, w: 64, h: 32 },
  { x: 688, y: 160, w: 48, h: 32 },
] as const;

export const COLLIDERS = [
  ...WALLS.map(({ x, y, w, h }) => ({ x, y, w, h })),
  ...FURNITURE_COLLIDERS,
];

export function segmentIntersectsCollider(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  collider: { x: number; y: number; w: number; h: number },
): boolean {
  const minX = Math.min(p1.x, p2.x);
  const maxX = Math.max(p1.x, p2.x);
  const minY = Math.min(p1.y, p2.y);
  const maxY = Math.max(p1.y, p2.y);
  if (p1.y === p2.y && p1.y > collider.y && p1.y < collider.y + collider.h) {
    return maxX >= collider.x && minX <= collider.x + collider.w;
  }
  if (p1.x === p2.x && p1.x > collider.x && p1.x < collider.x + collider.w) {
    return maxY >= collider.y && minY <= collider.y + collider.h;
  }
  return false;
}
