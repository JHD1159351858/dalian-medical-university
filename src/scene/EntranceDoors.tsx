import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { Box3, Group, Object3D, Vector3 } from 'three';
import { actorTriggersDoor, advanceDoorAngle, circleIntersectsBox, doorMayClose, entranceAction, MAX_DOOR_ANGLE, type DoorAction } from './collision';

export type DoorRuntime = {
  boxes: Box3[];
  leftAngle: number;
  rightAngle: number;
  doorwayClear: boolean;
  action: DoorAction;
  manualOpen: boolean;
  interact: () => void;
};

export function EntranceDoors({ scene, actors, runtime, paused }: {
  scene: Group;
  actors: Array<RefObject<Object3D | null>>;
  runtime: RefObject<DoorRuntime>;
  paused: boolean;
}) {
  const left = useRef<Object3D | null>(null);
  const right = useRef<Object3D | null>(null);
  const angle = useRef(0);
  const manualOpen = useRef(false);
  const requested = useRef(false);
  const interact = useCallback(() => { requested.current = true; }, []);
  const sweptArea = useMemo(() => new Box3(new Vector3(-1.42, 0, 4.2), new Vector3(1.42, 2.7, 6.2)), []);
  const positions = useMemo(() => [new Vector3(), new Vector3()], []);

  useEffect(() => {
    left.current = scene.getObjectByName('EntranceDoorLeft') ?? null;
    right.current = scene.getObjectByName('EntranceDoorRight') ?? null;
    if (!left.current || !right.current) throw new Error('医院资源缺少可交互入口门，请重新导出医院 GLB。');
    left.current.rotation.y = 0;
    right.current.rotation.y = 0;
  }, [scene]);

  useFrame((_, rawDelta) => {
    if (paused || document.hidden) return;
    const activeActors = actors.flatMap((actor, index) => {
      if (!actor.current) return [];
      actor.current.getWorldPosition(positions[index]);
      return [positions[index]];
    });
    // Patient passage is automatic; the player opens the door deliberately with F.
    const sensed = Boolean(actors[0].current) && actorTriggersDoor(positions[0]);
    const safeToClose = doorMayClose(activeActors, sweptArea, 0.34);
    if (requested.current) {
      requested.current = false;
      const action = entranceAction(manualOpen.current || angle.current > 0.02, sensed, safeToClose);
      if (action !== 'blocked') manualOpen.current = action === 'open';
    }
    const nextAngle = advanceDoorAngle(angle.current, Math.min(rawDelta, 0.05), sensed || manualOpen.current, safeToClose);
    if (left.current) left.current.rotation.y = nextAngle;
    if (right.current) right.current.rotation.y = -nextAngle;
    scene.updateWorldMatrix(true, true);
    let boxes = [left.current, right.current].flatMap((door) => door ? [new Box3().setFromObject(door)] : []);
    if (nextAngle !== angle.current && boxes.some((box) => activeActors.some((actor) => circleIntersectsBox(actor, box, 0.3)))) {
      if (left.current) left.current.rotation.y = angle.current;
      if (right.current) right.current.rotation.y = -angle.current;
      scene.updateWorldMatrix(true, true);
      boxes = [left.current, right.current].flatMap((door) => door ? [new Box3().setFromObject(door)] : []);
    } else angle.current = nextAngle;
    const doorway = new Vector3(0.55, 1, 5.49);
    const doorwayClear = angle.current >= MAX_DOOR_ANGLE - 0.05
      && boxes.every((box) => !box.clone().expandByScalar(0.3).containsPoint(doorway));
    runtime.current = {
      boxes,
      leftAngle: angle.current,
      rightAngle: -angle.current,
      doorwayClear,
      action: entranceAction(manualOpen.current || angle.current > 0.02, sensed, safeToClose),
      manualOpen: manualOpen.current,
      interact,
    };
  });
  return null;
}
