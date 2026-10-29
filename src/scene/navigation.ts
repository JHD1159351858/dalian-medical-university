export type Point = [number, number, number];
// The exported in-place Walk covers 0.56m per 1.2s at animation timeScale=1.
export const WALK_CLIP_SPEED = 0.56 / 1.2;
export const DOCTOR_MOVE_SPEED = 1.1;
export const PATIENT_MOVE_SPEED = 0.85;
export type NavigationGraph = Record<string, { position: Point; neighbors: string[] }>;
export type Obstacle = { minX: number; maxX: number; minZ: number; maxZ: number };

// Surveyed from the supplied hospital BLEND, converted (x,y,z) -> (x,z,-y).
export const patientStart: Point = [0.55, 0.031, 6.6];
export const consultationPoint: Point = [-1.35, 0.031, 2.55];
export const doctorPosition: Point = [-1.35, 0.031, 1.2];
export const staticObstacles: Obstacle[] = [
  { minX: -8, maxX: -1.207, minZ: 5.7, maxZ: 6 },
  { minX: 1.261, maxX: 8, minZ: 5.7, maxZ: 6 },
  { minX: -6.835, maxX: -2.124, minZ: 1.415, maxZ: 3.462 },
  { minX: -7.594, maxX: -1.294, minZ: 0.479, maxZ: 0.599 },
];
export const closedDoorObstacles: Obstacle[] = [
  { minX: -1.11, maxX: 0, minZ: 5.44, maxZ: 5.54 },
  { minX: 0, maxX: 1.11, minZ: 5.44, maxZ: 5.54 },
];
export const obstacles: Obstacle[] = [...staticObstacles, ...closedDoorObstacles];
export const navigationGraph: NavigationGraph = {
  start: { position: patientStart, neighbors: ['entrance'] },
  entrance: { position: [0.55, 0.031, 5.05], neighbors: ['start', 'lobby'] },
  lobby: { position: [-0.25, 0.031, 4.2], neighbors: ['entrance', 'approach'] },
  approach: { position: [-1.35, 0.031, 3.7], neighbors: ['lobby', 'consultation'] },
  consultation: { position: consultationPoint, neighbors: ['approach'] },
};

export const patientInboundPath: Point[] = [
  patientStart,
  [0.55, 0.031, 6.3],
  navigationGraph.entrance.position,
  navigationGraph.lobby.position,
  navigationGraph.approach.position,
  consultationPoint,
];
export const patientOutboundPath: Point[] = patientInboundPath.map((point) => [...point] as Point).reverse();

const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[2] - b[2]);

export function isSegmentClear(a: Point, b: Point, blockers: Obstacle[], radius = 0.27): boolean {
  return blockers.every((box) => {
    let near = 0;
    let far = 1;
    for (const [axis, min, max] of [[0, box.minX - radius, box.maxX + radius], [2, box.minZ - radius, box.maxZ + radius]]) {
      const delta = b[axis] - a[axis];
      if (Math.abs(delta) < 1e-9) {
        if (a[axis] < min || a[axis] > max) return true;
      } else {
        const t1 = (min - a[axis]) / delta;
        const t2 = (max - a[axis]) / delta;
        near = Math.max(near, Math.min(t1, t2));
        far = Math.min(far, Math.max(t1, t2));
        if (near > far) return true;
      }
    }
    return false;
  });
}

export function findPath(graph: NavigationGraph, start: string, end: string): Point[] {
  if (!graph[start] || !graph[end]) return [];
  const open = new Set([start]);
  const costs: Record<string, number> = { [start]: 0 };
  const previous: Record<string, string> = {};
  while (open.size) {
    const current = [...open].sort((a, b) => (costs[a] + distance(graph[a].position, graph[end].position)) - (costs[b] + distance(graph[b].position, graph[end].position)))[0];
    if (current === end) {
      const route = [graph[current].position];
      let node = current;
      while (previous[node]) { node = previous[node]; route.unshift(graph[node].position); }
      return route.map((point) => [...point]);
    }
    open.delete(current);
    for (const neighbor of graph[current].neighbors) {
      if (!graph[neighbor]) continue;
      const candidate = costs[current] + distance(graph[current].position, graph[neighbor].position);
      if (candidate < (costs[neighbor] ?? Infinity)) {
        costs[neighbor] = candidate;
        previous[neighbor] = current;
        open.add(neighbor);
      }
    }
  }
  return [];
}

export function advanceAlongPath(
  position: Point,
  path: Point[],
  index: number,
  maxDistance: number,
  canMove: (from: Point, to: Point) => boolean = () => true,
): { position: Point; index: number; distance: number; complete: boolean } {
  if (index >= path.length) return { position: [...position], index, distance: 0, complete: true };
  const target = path[index];
  const dx = target[0] - position[0];
  const dy = target[1] - position[1];
  const dz = target[2] - position[2];
  const remaining = Math.hypot(dx, dy, dz);
  const moved = Math.min(remaining, Math.max(0, maxDistance));
  const next: Point = remaining > 1e-9
    ? [position[0] + dx / remaining * moved, position[1] + dy / remaining * moved, position[2] + dz / remaining * moved]
    : [...target];
  if (!canMove(position, next)) return { position: [...position], index, distance: 0, complete: false };
  const reached = remaining <= moved + 1e-6;
  return {
    position: reached ? [...target] : next,
    index: reached ? index + 1 : index,
    distance: moved,
    complete: reached && index + 1 >= path.length,
  };
}
