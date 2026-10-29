import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Box3, Group, Quaternion, Ray, Vector3, type Object3D } from 'three';
import { Capsule } from 'three/addons/math/Capsule.js';
import type { Octree } from 'three/addons/math/Octree.js';
import type { Phase } from '../flow';
import { Character } from './Character';
import { canInteractWithPatient, canReachEntrance, movePlanarCircle, normalizeMovementInput, type DoorAction } from './collision';
import { doctorPosition, DOCTOR_MOVE_SPEED, WALK_CLIP_SPEED } from './navigation';
import type { DoorRuntime } from './EntranceDoors';

const DOCTOR_RADIUS = 0.3;
const up = new Vector3(0, 1, 0);

export function DoctorController({
  phase,
  movementInput,
  interactionRequest,
  patient,
  groupRef,
  staticWorld,
  dynamicColliders,
  sightColliders,
  door,
  onLoaded,
  onInteract,
  onInteractionChange,
  onDoorInteractionChange,
}: {
  phase: Phase;
  movementInput: RefObject<{ x: number; y: number }>;
  interactionRequest: number;
  patient: RefObject<Group | null>;
  groupRef: RefObject<Group | null>;
  staticWorld: Octree;
  dynamicColliders: () => Box3[];
  sightColliders: () => Box3[];
  door: RefObject<DoorRuntime>;
  groundMeshes: Group;
  onLoaded: (root: Object3D) => void;
  onInteract: () => void;
  onInteractionChange: (eligible: boolean) => void;
  onDoorInteractionChange: (action: DoorAction | null) => void;
}) {
  const { camera } = useThree();
  const keys = useRef(new Set<string>());
  const lastRequest = useRef(interactionRequest);
  const eligibleRef = useRef(false);
  const doorActionRef = useRef<DoorAction | null>(null);
  const speed = useRef(1);
  const [moving, setMoving] = useState(false);
  const enabled = ['walking', 'waiting', 'exiting', 'completed'].includes(phase);
  const velocity = useRef(new Vector3());
  const pendingInteraction = useRef<number | null>(null);
  const temp = useMemo(() => ({
    right: new Vector3(),
    forward: new Vector3(),
    desired: new Vector3(),
    facing: new Vector3(),
    rotation: new Quaternion(),
    previous: new Vector3(),
    ray: new Ray(),
  }), []);

  const clearKeys = useCallback(() => { keys.current.clear(); velocity.current.set(0, 0, 0); }, []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (!enabled || event.ctrlKey || event.altKey || event.metaKey || target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(event.key.toLowerCase())) {
        event.preventDefault();
        keys.current.add(event.key.toLowerCase());
      }
    };
    const onKeyUp = (event: KeyboardEvent) => { keys.current.delete(event.key.toLowerCase()); };
    const onVisibility = () => { if (document.hidden) clearKeys(); };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearKeys);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearKeys);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [clearKeys, enabled]);
  useEffect(() => { if (!enabled) clearKeys(); }, [clearKeys, enabled]);

  useFrame((_, rawDelta) => {
    const doctor = groupRef.current;
    const patientObject = patient.current;
    if (!doctor || !patientObject) return;
    const delta = Math.min(rawDelta, 0.05);
    let actualDistance = 0;

    if (enabled && !document.hidden && pendingInteraction.current === null) {
      const external = movementInput.current ?? { x: 0, y: 0 };
      const keyboardX = Number(keys.current.has('d') || keys.current.has('arrowright')) - Number(keys.current.has('a') || keys.current.has('arrowleft'));
      const keyboardY = Number(keys.current.has('w') || keys.current.has('arrowup')) - Number(keys.current.has('s') || keys.current.has('arrowdown'));
      const input = normalizeMovementInput(external.x + keyboardX, external.y + keyboardY);
      camera.updateMatrixWorld();
      temp.right.setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize();
      camera.getWorldDirection(temp.forward).setY(0).normalize();
      temp.desired.copy(temp.right).multiplyScalar(input.x).addScaledVector(temp.forward, input.y).multiplyScalar(DOCTOR_MOVE_SPEED);
      velocity.current.lerp(temp.desired, 1 - Math.exp(-delta * 18));
      if (input.lengthSq() === 0 && velocity.current.length() < 0.012) velocity.current.set(0, 0, 0);
      temp.desired.copy(velocity.current).multiplyScalar(delta);
      temp.previous.copy(doctor.position);
      const groundCheck = (position: Vector3) => {
        for (const [x, z] of [[0, 0], [0.27, 0], [-0.27, 0], [0, 0.27], [0, -0.27]]) {
          temp.ray.set(new Vector3(position.x + x, 0.25, position.z + z), new Vector3(0, -1, 0));
          const hit = staticWorld.rayIntersect(temp.ray);
          if (!hit || hit.position.y < -0.1 || hit.position.y > 0.16) return false;
        }
        return true;
      };
      const planar = movePlanarCircle(doctor.position, temp.desired, dynamicColliders(), DOCTOR_RADIUS, groundCheck);
      if (!planar.blocked && temp.desired.lengthSq() > 1e-10) {
        const capsule = new Capsule(
          new Vector3(planar.position.x, planar.position.y + DOCTOR_RADIUS + 0.015, planar.position.z),
          new Vector3(planar.position.x, planar.position.y + 1.42, planar.position.z),
          DOCTOR_RADIUS,
        );
        for (let pass = 0; pass < 3; pass++) {
          const collision = staticWorld.capsuleIntersect(capsule);
          if (!collision) break;
          capsule.translate(collision.normal.multiplyScalar(collision.depth));
        }
        const resolved = new Vector3(capsule.start.x, planar.position.y, capsule.start.z);
        const finalMove = movePlanarCircle(doctor.position, resolved.clone().sub(doctor.position), dynamicColliders(), DOCTOR_RADIUS, groundCheck);
        doctor.position.copy(finalMove.position);
        actualDistance = doctor.position.distanceTo(temp.previous);
        if (actualDistance > 1e-5) {
          temp.facing.copy(doctor.position).sub(temp.previous).normalize();
          temp.rotation.setFromAxisAngle(up, Math.atan2(temp.facing.x, temp.facing.z));
          doctor.quaternion.slerp(temp.rotation, 1 - Math.exp(-delta * 12));
        }
      }
    }

    const isMoving = actualDistance > 1e-5;
    if (isMoving !== moving) setMoving(isMoving);
    speed.current = delta > 0 ? actualDistance / delta / WALK_CLIP_SPEED : 0;

    if (pendingInteraction.current !== null || ['patientSpeech', 'doctorDialog'].includes(phase)) {
      temp.facing.copy(patientObject.position).sub(doctor.position).setY(0);
      if (temp.facing.lengthSq() > 1e-6) {
        temp.rotation.setFromAxisAngle(up, Math.atan2(temp.facing.x, temp.facing.z));
        doctor.quaternion.slerp(temp.rotation, 1 - Math.exp(-delta * 7));
      }
    }

    doctor.getWorldDirection(temp.facing).setY(0).normalize();
    const hasLineOfSight = (from: Vector3, to: Vector3) => {
      const origin = from.clone().add(new Vector3(0, 1.2, 0));
      const target = to.clone().add(new Vector3(0, 1.2, 0));
      const direction = target.sub(origin);
      const distance = direction.length();
      temp.ray.set(origin, direction.normalize());
      const staticHit = staticWorld.rayIntersect(temp.ray) as false | { distance: number };
      if (staticHit && staticHit.distance < distance - 0.08) return false;
      return !sightColliders().some((box) => { const hit = temp.ray.intersectBox(box, new Vector3()); return hit !== null && hit.distanceTo(origin) < distance - 0.08; });
    };
    const eligible = phase === 'waiting' && pendingInteraction.current === null && canInteractWithPatient(doctor.position, temp.facing, patientObject.position, hasLineOfSight);
    if (eligible !== eligibleRef.current) {
      eligibleRef.current = eligible;
      onInteractionChange(eligible);
    }
    // The target door must not occlude its own interaction ray; static walls still do.
    const doorVisible = (from: Vector3, to: Vector3) => {
      const origin = from.clone().add(new Vector3(0, 1.2, 0));
      const direction = to.clone().sub(from).setY(0);
      const distance = direction.length();
      const hit = staticWorld.rayIntersect(new Ray(origin, direction.normalize()));
      return !hit || hit.distance >= distance - 0.08;
    };
    const doorAction = enabled && !eligible && pendingInteraction.current === null && canReachEntrance(doctor.position, temp.facing, doorVisible) ? door.current.action : null;
    if (doorAction !== doorActionRef.current) {
      doorActionRef.current = doorAction;
      onDoorInteractionChange(doorAction);
    }
    if (interactionRequest !== lastRequest.current) {
      lastRequest.current = interactionRequest;
      if (eligible) {
        clearKeys();
        pendingInteraction.current = 0;
      } else if (doorAction && doorAction !== 'blocked') {
        door.current.interact();
      }
    }
    if (pendingInteraction.current !== null) {
      pendingInteraction.current += delta;
      temp.facing.copy(doctor.position).sub(patientObject.position).setY(0);
      temp.rotation.setFromAxisAngle(up, Math.atan2(temp.facing.x, temp.facing.z));
      patientObject.quaternion.slerp(temp.rotation, 1 - Math.exp(-delta * 12));
      if (pendingInteraction.current >= 0.4) {
        pendingInteraction.current = null;
        onInteract();
      }
    }
  });

  return (
    <group ref={groupRef} position={doctorPosition}>
      <Character kind="doctor" animation={moving ? 'Walk' : 'Idle'} speed={speed} onLoaded={onLoaded} />
    </group>
  );
}
