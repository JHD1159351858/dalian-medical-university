import { Box3, Ray, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Capsule } from 'three/addons/math/Capsule.js';
import {
  advanceDoorAngle,
  actorTriggersDoor,
  canInteractWithPatient,
  canReachEntrance,
  entranceAction,
  doorMayClose,
  movePlanarCircle,
  normalizeMovementInput,
  hospitalCollision,
} from '../src/scene/collision';

describe('collision against the delivered hospital geometry', () => {
  let tree: ReturnType<typeof hospitalCollision>;
  beforeAll(async () => {
    const bytes = await readFile(new URL('../public/models/hospital.glb', import.meta.url));
    const asset = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    tree = hospitalCollision(asset.scene);
    expect(hospitalCollision(asset.scene)).toBe(tree);
  });
  it('supports the consultation floor and entrance pavement but not the exterior void', () => {
    for (const [x, z] of [[-1.35, 1.2], [0.55, 6.6]]) {
      const hit = tree.rayIntersect(new Ray(new Vector3(x, 0.25, z), new Vector3(0, -1, 0)));
      expect(hit).toBeTruthy();
      if (hit) expect(hit.position.y).toBeGreaterThanOrEqual(-0.1);
    }
    expect(tree.rayIntersect(new Ray(new Vector3(10, 0.25, 10), new Vector3(0, -1, 0)))).toBe(false);
  });
  it('collides with the original reception desk and outside wall', () => {
    for (const [x, z] of [[-2.2, 2.5], [7.95, 0]]) {
      const capsule = new Capsule(new Vector3(x, 0.346, z), new Vector3(x, 1.451, z), 0.3);
      expect(tree.capsuleIntersect(capsule)).toBeTruthy();
    }
  });
  it('keeps the entrance free of static door triangles so moving leaves own its collision', () => {
    const capsule = new Capsule(new Vector3(0.55, 0.346, 5.49), new Vector3(0.55, 1.451, 5.49), 0.3);
    expect(tree.capsuleIntersect(capsule)).toBe(false);
  });
});

describe('doctor movement', () => {
  it('normalizes diagonal input so it is not faster than axial input', () => {
    const axial = normalizeMovementInput(1, 0);
    const diagonal = normalizeMovementInput(1, 1);
    expect(axial.length()).toBeCloseTo(1);
    expect(diagonal.length()).toBeCloseTo(1);
    expect(diagonal.x).toBeCloseTo(Math.SQRT1_2);
    expect(diagonal.y).toBeCloseTo(Math.SQRT1_2);
  });

  it('stops at a collider and reports only actual movement', () => {
    const wall = new Box3(new Vector3(0.6, 0, -1), new Vector3(1, 2, 1));
    const result = movePlanarCircle(new Vector3(0, 0.031, 0), new Vector3(1, 0, 0), [wall], 0.3, () => true);
    expect(result.position.x).toBeCloseTo(0);
    expect(result.distance).toBe(0);
    expect(result.blocked).toBe(true);
  });

  it('rejects movement beyond the walkable ground boundary', () => {
    const result = movePlanarCircle(
      new Vector3(0, 0.031, 0),
      new Vector3(0.2, 0, 0),
      [],
      0.3,
      (point) => point.x <= 0.1,
    );
    expect(result.position.toArray()).toEqual([0, 0.031, 0]);
    expect(result.distance).toBe(0);
    expect(result.blocked).toBe(true);
  });
  it('cannot tunnel across a thin door when a movement spans its full thickness', () => {
    const door = new Box3(new Vector3(0.5, 0, -1), new Vector3(0.55, 2, 1));
    expect(movePlanarCircle(new Vector3(), new Vector3(2, 0, 0), [door], 0.3, () => true).blocked).toBe(true);
  });
});

describe('patient interaction', () => {
  const patient = new Vector3(0, 0, 1);

  it('requires range, facing and a clear line of sight', () => {
    expect(canInteractWithPatient(new Vector3(), new Vector3(0, 0, 1), patient, () => true)).toBe(true);
    expect(canInteractWithPatient(new Vector3(), new Vector3(0, 0, -1), patient, () => true)).toBe(false);
    expect(canInteractWithPatient(new Vector3(), new Vector3(0, 0, 1), new Vector3(0, 0, 1.21), () => true)).toBe(false);
    expect(canInteractWithPatient(new Vector3(), new Vector3(0, 0, 1), patient, () => false)).toBe(false);
  });

  it('accepts the inclusive 60 degree facing limit', () => {
    const facing = new Vector3(Math.sin(Math.PI / 3), 0, Math.cos(Math.PI / 3));
    expect(canInteractWithPatient(new Vector3(), facing, patient, () => true)).toBe(true);
  });
});

describe('entrance doors', () => {
  it('requires the player to approach and face the entrance without a wall in between', () => {
    const position = new Vector3(0, 0.031, 3.6);
    const forward = new Vector3(0, 0, 1);
    expect(canReachEntrance(position, forward, () => true)).toBe(true);
    expect(canReachEntrance(position, forward.clone().negate(), () => true)).toBe(false);
    expect(canReachEntrance(new Vector3(0, 0.031, 3), forward, () => true)).toBe(false);
    expect(canReachEntrance(position, forward, () => false)).toBe(false);
  });

  it('allows manual opening and closing but protects patient passage and occupied door sweeps', () => {
    expect(entranceAction(false, false, true)).toBe('open');
    expect(entranceAction(true, false, true)).toBe('close');
    expect(entranceAction(true, true, true)).toBe('blocked');
    expect(entranceAction(true, false, false)).toBe('blocked');
  });

  it('senses an exiting patient before they enter the inward door sweep', () => {
    expect(actorTriggersDoor(new Vector3(-1.35, 0.031, 3.7))).toBe(true);
    expect(actorTriggersDoor(new Vector3(0.55, 0.031, 6.6))).toBe(false);
  });
  it('opens toward 85 degrees and pauses closing while an actor occupies the swept area', () => {
    const open = advanceDoorAngle(0, 1, true, true);
    expect(open).toBeGreaterThan(0);
    expect(open).toBeLessThanOrEqual(85 * Math.PI / 180);
    expect(advanceDoorAngle(open, 1, false, false)).toBe(open);
  });

  it('does not close through either actor', () => {
    const sweptArea = new Box3(new Vector3(-1.3, 0, 4.25), new Vector3(1.3, 2, 6.25));
    expect(doorMayClose([new Vector3(0.5, 0, 5.2)], sweptArea, 0.3)).toBe(false);
    expect(doorMayClose([new Vector3(3, 0, 3)], sweptArea, 0.3)).toBe(true);
  });
});
