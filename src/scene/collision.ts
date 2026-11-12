import { Box3, Mesh, Triangle, Vector2, Vector3, type Object3D } from 'three';
import { Octree } from 'three/addons/math/Octree.js';

const collisionCache = new WeakMap<Object3D, Octree>();

export function hospitalCollision(source: Object3D): Octree {
  const cached = collisionCache.get(source);
  if (cached) return cached;
  const tree = new Octree();
  source.updateWorldMatrix(true, true);
  source.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    for (let parent: Object3D | null = object; parent; parent = parent.parent) {
      if (parent.name === 'EntranceDoorLeft' || parent.name === 'EntranceDoorRight') return;
    }
    const positions = object.geometry.attributes.position;
    const indices = object.geometry.index;
    const count = indices?.count ?? positions.count;
    for (let i = 0; i < count; i += 3) {
      const vertices = [0, 1, 2].map((j) => new Vector3()
        .fromBufferAttribute(positions, indices ? indices.getX(i + j) : i + j)
        .applyMatrix4(object.matrixWorld));
      // Actor capsules top out at 1.751m; sight rays are 1.231m high.
      // Keep every triangle crossing their height band, including full walls.
      // Unreachable ceiling/roof detail otherwise explodes octree subdivision.
      if (Math.min(...vertices.map((v) => v.y)) > 1.85 || Math.max(...vertices.map((v) => v.y)) < -0.12) continue;
      tree.addTriangle(new Triangle(vertices[0], vertices[1], vertices[2]));
    }
  });
  tree.build();
  collisionCache.set(source, tree);
  return tree;
}

const INTERACTION_DISTANCE = 1.2;
const INTERACTION_COSINE = Math.cos(Math.PI / 3);
export const MAX_DOOR_ANGLE = 85 * Math.PI / 180;
const DOOR_SPEED = 2.4;
export type DoorAction = 'open' | 'close' | 'blocked';

export function entranceAction(open: boolean, patientPassing: boolean, safeToClose: boolean): DoorAction {
  return open ? (patientPassing || !safeToClose ? 'blocked' : 'close') : 'open';
}

export function canReachEntrance(position: Vector3, forward: Vector3, hasLineOfSight: (from: Vector3, to: Vector3) => boolean): boolean {
  const target = new Vector3(0, position.y, 5.49);
  const direction = target.clone().sub(position).setY(0);
  const distance = direction.length();
  return distance <= 2.1 && distance > 1e-6
    && forward.clone().setY(0).normalize().dot(direction.normalize()) >= 0.5
    && hasLineOfSight(position, target);
}

export function normalizeMovementInput(x: number, y: number): Vector2 {
  const result = new Vector2(x, y);
  if (result.lengthSq() > 1) result.normalize();
  return result;
}

export function circleIntersectsBox(point: Vector3, box: Box3, radius: number): boolean {
  const x = Math.max(box.min.x, Math.min(point.x, box.max.x));
  const z = Math.max(box.min.z, Math.min(point.z, box.max.z));
  return (point.x - x) ** 2 + (point.z - z) ** 2 < radius ** 2;
}

export function movePlanarCircle(
  origin: Vector3,
  displacement: Vector3,
  colliders: readonly Box3[],
  radius: number,
  hasGround: (position: Vector3) => boolean,
): { position: Vector3; distance: number; blocked: boolean } {
  const proposed = origin.clone().add(displacement);
  // Small swept steps prevent a stalled frame from jumping over a thin leaf or wall.
  const steps = Math.max(1, Math.ceil(displacement.length() / Math.max(radius / 2, 0.01)));
  for (let index = 1; index <= steps; index++) {
    const sample = origin.clone().addScaledVector(displacement, index / steps);
    if (!hasGround(sample) || colliders.some((box) => circleIntersectsBox(sample, box, radius))) {
      return { position: origin.clone(), distance: 0, blocked: displacement.lengthSq() > 0 };
    }
  }
  return { position: proposed, distance: displacement.length(), blocked: false };
}

export function canInteractWithPatient(
  doctorPosition: Vector3,
  doctorForward: Vector3,
  patientPosition: Vector3,
  hasLineOfSight: (from: Vector3, to: Vector3) => boolean,
): boolean {
  const towardPatient = patientPosition.clone().sub(doctorPosition);
  towardPatient.y = 0;
  const distance = towardPatient.length();
  if (distance > INTERACTION_DISTANCE || distance < 1e-6) return false;
  const facing = doctorForward.clone();
  facing.y = 0;
  if (facing.lengthSq() < 1e-9) return false;
  return facing.normalize().dot(towardPatient.normalize()) >= INTERACTION_COSINE - 1e-9
    && hasLineOfSight(doctorPosition, patientPosition);
}

export function doorMayClose(actorPositions: readonly Vector3[], sweptArea: Box3, radius: number): boolean {
  return actorPositions.every((position) => !circleIntersectsBox(position, sweptArea, radius));
}

export function advanceDoorAngle(
  current: number,
  delta: number,
  actorInSensor: boolean,
  safeToClose: boolean,
): number {
  const target = actorInSensor ? MAX_DOOR_ANGLE : safeToClose ? 0 : current;
  const amount = Math.min(Math.abs(target - current), Math.max(0, delta) * DOOR_SPEED);
  return current + Math.sign(target - current) * amount;
}

export function actorTriggersDoor(position: Vector3): boolean {
  // Sense from indoors before an actor reaches the inward-opening leaf sweep.
  return position.x >= -1.65 && position.x <= 1.65 && position.z >= 3.5 && position.z <= 6.45;
}
