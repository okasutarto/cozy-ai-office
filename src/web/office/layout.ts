export const OFFICE_WIDTH = 352;
export const OFFICE_HEIGHT = 240;
export const TILE_SIZE = 16;

export const STATIONS = {
  "manager-desk": { x: 56, y: 64 },
  meeting: { x: 168, y: 64 },
  bookshelf: { x: 288, y: 64 },
  "worker-1-desk": { x: 48, y: 136 },
  "worker-2-desk": { x: 128, y: 136 },
  "worker-3-desk": { x: 208, y: 136 },
  "worker-4-desk": { x: 288, y: 136 },
  coffee: { x: 48, y: 208 },
  integration: { x: 168, y: 208 },
  qa: { x: 288, y: 208 },
} as const;

export type StationName = keyof typeof STATIONS;

export const NAV_GRAPH: Record<StationName, StationName[]> = {
  "manager-desk": ["meeting", "worker-1-desk"],
  meeting: ["manager-desk", "bookshelf", "worker-2-desk", "worker-3-desk"],
  bookshelf: ["meeting", "worker-4-desk"],
  "worker-1-desk": ["manager-desk", "worker-2-desk", "coffee"],
  "worker-2-desk": ["worker-1-desk", "worker-3-desk", "meeting", "integration"],
  "worker-3-desk": ["worker-2-desk", "worker-4-desk", "meeting", "integration"],
  "worker-4-desk": ["worker-3-desk", "bookshelf", "qa"],
  coffee: ["worker-1-desk", "integration"],
  integration: ["coffee", "qa", "worker-2-desk", "worker-3-desk"],
  qa: ["integration", "worker-4-desk"],
};

export const NAV_ROUTES: Record<string, { x: number; y: number }[]> = {
  "manager-desk|meeting": [STATIONS["manager-desk"], { x: 56, y: 88 }, { x: 168, y: 88 }, STATIONS["meeting"]],
  "manager-desk|worker-1-desk": [STATIONS["manager-desk"], { x: 56, y: 88 }, { x: 48, y: 88 }, STATIONS["worker-1-desk"]],
  "meeting|bookshelf": [STATIONS["meeting"], { x: 168, y: 88 }, { x: 288, y: 88 }, STATIONS["bookshelf"]],
  "meeting|worker-2-desk": [STATIONS["meeting"], { x: 168, y: 88 }, { x: 128, y: 88 }, STATIONS["worker-2-desk"]],
  "meeting|worker-3-desk": [STATIONS["meeting"], { x: 168, y: 88 }, { x: 208, y: 88 }, STATIONS["worker-3-desk"]],
  "bookshelf|worker-4-desk": [STATIONS["bookshelf"], { x: 288, y: 88 }, STATIONS["worker-4-desk"]],
  "worker-1-desk|worker-2-desk": [STATIONS["worker-1-desk"], { x: 48, y: 168 }, { x: 128, y: 168 }, STATIONS["worker-2-desk"]],
  "worker-1-desk|coffee": [STATIONS["worker-1-desk"], { x: 48, y: 168 }, STATIONS["coffee"]],
  "worker-2-desk|worker-3-desk": [STATIONS["worker-2-desk"], { x: 128, y: 168 }, { x: 208, y: 168 }, STATIONS["worker-3-desk"]],
  "worker-2-desk|integration": [STATIONS["worker-2-desk"], { x: 128, y: 168 }, { x: 168, y: 168 }, STATIONS["integration"]],
  "worker-3-desk|worker-4-desk": [STATIONS["worker-3-desk"], { x: 208, y: 168 }, { x: 288, y: 168 }, STATIONS["worker-4-desk"]],
  "worker-3-desk|integration": [STATIONS["worker-3-desk"], { x: 208, y: 168 }, { x: 168, y: 168 }, STATIONS["integration"]],
  "worker-4-desk|qa": [STATIONS["worker-4-desk"], { x: 288, y: 168 }, STATIONS["qa"]],
  "coffee|integration": [STATIONS["coffee"], { x: 48, y: 168 }, { x: 168, y: 168 }, STATIONS["integration"]],
  "integration|qa": [STATIONS["integration"], { x: 168, y: 168 }, { x: 288, y: 168 }, STATIONS["qa"]],
};

export const ROOMS = [
  { name: "Manager cabin", x: 16, y: 16, w: 80, h: 64 },
  { name: "Meeting area", x: 112, y: 16, w: 112, h: 64 },
  { name: "Advisor library", x: 240, y: 16, w: 96, h: 64 },
  { name: "Worker floor", x: 16, y: 96, w: 320, h: 64 },
  { name: "Coffee area", x: 16, y: 176, w: 80, h: 48 },
  { name: "Integration", x: 112, y: 176, w: 112, h: 48 },
  { name: "QA lab", x: 240, y: 176, w: 96, h: 48 },
];

export const COLLIDERS = [
  // Outer boundary walls and room dividers
  { x: 0, y: 0, w: 352, h: 16 },
  { x: 0, y: 224, w: 352, h: 16 },
  { x: 0, y: 0, w: 16, h: 240 },
  { x: 336, y: 0, w: 16, h: 240 },

  // Furniture stubs serving as colliders (avoiding waypoint overlapping)
  { x: 56, y: 48, w: 16, h: 12 },
  { x: 168, y: 48, w: 16, h: 12 },
  { x: 288, y: 48, w: 16, h: 12 },
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

  // If segment is horizontal
  if (p1.y === p2.y) {
    if (p1.y > collider.y && p1.y < collider.y + collider.h) {
      return maxX >= collider.x && minX <= collider.x + collider.w;
    }
  }

  // If segment is vertical
  if (p1.x === p2.x) {
    if (p1.x > collider.x && p1.x < collider.x + collider.w) {
      return maxY >= collider.y && minY <= collider.y + collider.h;
    }
  }

  return false;
}
