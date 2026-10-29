import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls, useGLTF } from '@react-three/drei';
import { Box3, Group, Mesh, OrthographicCamera, Quaternion, Vector3, type Object3D } from 'three';
import type { OrbitControls as OrbitControlsInstance } from 'three-stdlib';
import type { Phase } from '../flow';
import { Character } from './Character';
import { DoctorController } from './DoctorController';
import { EntranceDoors, type DoorRuntime } from './EntranceDoors';
import { hospitalCollision, movePlanarCircle, type DoorAction } from './collision';
import {
  advanceAlongPath,
  PATIENT_MOVE_SPEED,
  WALK_CLIP_SPEED,
  consultationPoint,
  patientInboundPath,
  patientOutboundPath,
  patientStart,
  type Point,
} from './navigation';

const ACTOR_RADIUS = 0.3;
const up = new Vector3(0, 1, 0);

export type HospitalSceneProps = {
  phase: Phase;
  patientSpeaking: boolean;
  movementInput: RefObject<{ x: number; y: number }>;
  interactionRequest: number;
  onReady: () => void;
  onArrive: () => void;
  onDepart: () => void;
  onInteract: () => void;
  onInteractionChange: (eligible: boolean) => void;
  onDoorInteractionChange: (action: DoorAction | null) => void;
};

function actorBox(group: Group | null): Box3[] {
  if (!group) return [];
  return [new Box3(
    new Vector3(group.position.x - ACTOR_RADIUS, group.position.y, group.position.z - ACTOR_RADIUS),
    new Vector3(group.position.x + ACTOR_RADIUS, group.position.y + 1.75, group.position.z + ACTOR_RADIUS),
  )];
}

function jointsOf(root: Object3D | null): Record<string, number[]> {
  const joints: Record<string, number[]> = {};
  root?.traverse((object) => {
    if (/^(Thigh|Shin|Foot)/.test(object.name)) joints[object.name] = object.quaternion.toArray();
  });
  return joints;
}

export function HospitalScene({
  phase,
  patientSpeaking,
  movementInput,
  interactionRequest,
  onReady,
  onArrive,
  onDepart,
  onInteract,
  onInteractionChange,
  onDoorInteractionChange,
}: HospitalSceneProps) {
  const hospital = useGLTF('/models/hospital.glb');
  const scene = useMemo(() => hospital.scene.clone(true), [hospital.scene]);
  const zoomTarget = useRef<number | null>(null);
  const patient = useRef<Group>(null);
  const doctor = useRef<Group>(null);
  const patientModel = useRef<Object3D | null>(null);
  const doctorModel = useRef<Object3D | null>(null);
  const controls = useRef<OrbitControlsInstance>(null);
  const doors = useRef<DoorRuntime>({ boxes: [], leftAngle: 0, rightAngle: 0, doorwayClear: false, action: 'open', manualOpen: false, interact: () => {} });
  const pathIndex = useRef(1);
  const settleElapsed = useRef(0);
  const calledArrival = useRef(false);
  const calledDeparture = useRef(false);
  const patientSpeed = useRef(1);
  const eligible = useRef(false);
  const [patientMoving, setPatientMoving] = useState(false);
  const [loaded, setLoaded] = useState({ patient: false, doctor: false });
  const { camera, size } = useThree();
  const temp = useMemo(() => ({
    direction: new Vector3(),
    rotation: new Quaternion(),
    cameraShift: new Vector3(),
    target: new Vector3(),
  }), []);
  const staticWorld = useMemo(() => hospitalCollision(hospital.scene), [hospital.scene]);

  const onPatientLoaded = useCallback((root: Object3D) => {
    patientModel.current = root;
    setLoaded((old) => old.patient ? old : { ...old, patient: true });
  }, []);
  const onDoctorLoaded = useCallback((root?: unknown) => {
    if (root instanceof Group) doctorModel.current = root;
    setLoaded((old) => old.doctor ? old : { ...old, doctor: true });
  }, []);
  const reportInteraction = useCallback((next: boolean) => {
    eligible.current = next;
    onInteractionChange(next);
  }, [onInteractionChange]);

  useEffect(() => {
    scene.traverse((object) => {
      if (object instanceof Mesh) {
        object.receiveShadow = true;
        object.castShadow = true;
      }
    });
  }, [scene]);
  useEffect(() => { if (loaded.patient && loaded.doctor) onReady(); }, [loaded, onReady]);
  useEffect(() => {
    if (!patient.current) return;
    if (phase === 'ready') {
      patient.current.position.set(...patientStart);
      patient.current.rotation.set(0, Math.PI, 0);
      pathIndex.current = 1;
      settleElapsed.current = 0;
      calledArrival.current = false;
      calledDeparture.current = false;
      setPatientMoving(false);
      camera.position.set(14, 17, 22);
      temp.target.set(0, 0.5, 0.5);
      camera.lookAt(temp.target);
      controls.current?.target.copy(temp.target);
    }
    if (phase === 'walking') {
      zoomTarget.current = Math.min(size.width / (size.width < 680 ? 8 : 16), size.height / 12);
      pathIndex.current = 1;
      settleElapsed.current = 0;
      calledArrival.current = false;
    }
    if (phase === 'exiting') {
      pathIndex.current = 1;
      settleElapsed.current = 0;
      calledDeparture.current = false;
    }
  }, [camera, phase, temp]);
  useEffect(() => {
    if ('zoom' in camera) {
      camera.zoom = phase === 'loading' || phase === 'ready' ? Math.min(size.width / 25, size.height / 19) : Math.min(size.width / (size.width < 680 ? 8 : 16), size.height / 12);
      camera.updateProjectionMatrix();
    }
  }, [camera, size]);

  useFrame((state, rawDelta) => {
    if (!patient.current || !doctor.current) return;
    const delta = Math.min(rawDelta, 0.05);
    if (zoomTarget.current !== null && 'zoom' in camera && phase !== 'diagnosis') {
      camera.zoom += (zoomTarget.current - camera.zoom) * (1 - Math.exp(-delta * 3));
      if (Math.abs(camera.zoom - zoomTarget.current) < 0.02) zoomTarget.current = null;
      camera.updateProjectionMatrix();
    }
    const route = phase === 'exiting' ? patientOutboundPath : patientInboundPath;
    const routeActive = phase === 'walking' || phase === 'exiting';
    let moved = 0;

    if (routeActive && !document.hidden && pathIndex.current < route.length) {
      const current = patient.current.position.toArray() as Point;
      const remaining = patient.current.position.distanceTo(temp.target.set(...route[route.length - 1]));
      const velocity = PATIENT_MOVE_SPEED * Math.min(1, 0.35 + remaining / 0.7);
      const step = advanceAlongPath(current, route, pathIndex.current, velocity * delta, (from, to) => {
        // Outbound actors wait before the inward sweep as well as the threshold.
        if (Math.min(from[2], to[2]) < 5.95 && Math.max(from[2], to[2]) > 3.85 && !doors.current.doorwayClear) return false;
        const displacement = new Vector3(to[0] - from[0], 0, to[2] - from[2]);
        const colliders = [...doors.current.boxes, ...actorBox(doctor.current)];
        return !movePlanarCircle(new Vector3(...from), displacement, colliders, ACTOR_RADIUS, () => true).blocked;
      });
      patient.current.position.set(...step.position);
      pathIndex.current = step.index;
      moved = step.distance;
      patientSpeed.current = delta > 0 ? moved / delta / WALK_CLIP_SPEED : 0;
      if (moved > 1e-6) {
        temp.direction.set(step.position[0] - current[0], 0, step.position[2] - current[2]).normalize();
        temp.rotation.setFromAxisAngle(up, Math.atan2(temp.direction.x, temp.direction.z));
        patient.current.quaternion.slerp(temp.rotation, 1 - Math.exp(-delta * 10));
      }
    }

    if (routeActive && pathIndex.current >= route.length) {
      if (phase === 'walking') {
        temp.direction.copy(doctor.current.position).sub(patient.current.position).setY(0);
        if (temp.direction.lengthSq() > 1e-6) {
          temp.rotation.setFromAxisAngle(up, Math.atan2(temp.direction.x, temp.direction.z));
          patient.current.quaternion.slerp(temp.rotation, 1 - Math.exp(-delta * 8));
        }
        settleElapsed.current += delta;
        if (settleElapsed.current >= 0.45 && !calledArrival.current) {
          calledArrival.current = true;
          onArrive();
        }
      } else if (!calledDeparture.current) {
        calledDeparture.current = true;
        onDepart();
      }
    }
    if (['patientSpeech', 'doctorDialog'].includes(phase)) {
      temp.direction.copy(doctor.current.position).sub(patient.current.position).setY(0);
      if (temp.direction.lengthSq() > 1e-6) {
        temp.rotation.setFromAxisAngle(up, Math.atan2(temp.direction.x, temp.direction.z));
        patient.current.quaternion.slerp(temp.rotation, 1 - Math.exp(-delta * 7));
      }
    }
    const moving = routeActive && moved > 1e-6;
    if (moving !== patientMoving) setPatientMoving(moving);

    if (['walking', 'waiting', 'exiting', 'completed'].includes(phase) && controls.current) {
      temp.target.copy(doctor.current.position).add(new Vector3(0, 0.72, 0));
      temp.cameraShift.copy(temp.target).sub(controls.current.target).multiplyScalar(1 - Math.exp(-delta * 3.5));
      controls.current.target.add(temp.cameraShift);
      camera.position.add(temp.cameraShift);
      controls.current.update();
    }

    if (import.meta.env.DEV) {
      const diagnostic = window as Window & { __hospitalScene?: Record<string, unknown> };
      diagnostic.__hospitalScene = {
        phase,
        eligible: eligible.current,
        walking: moving,
        position: patient.current.position.toArray(),
        patient: {
          position: patient.current.position.toArray(),
          quaternion: patient.current.quaternion.toArray(),
          joints: jointsOf(patientModel.current),
        },
        doctor: {
          position: doctor.current.position.toArray(),
          quaternion: doctor.current.quaternion.toArray(),
          joints: jointsOf(doctorModel.current),
        },
        doors: { leftAngle: doors.current.leftAngle, rightAngle: doors.current.rightAngle, action: doors.current.action, manualOpen: doors.current.manualOpen },
        camera: {
          position: camera.position.toArray(),
          target: controls.current?.target.toArray() ?? [0, 0, 0],
          quaternion: camera.quaternion.toArray(),
          zoom: camera.zoom,
          frustum: camera instanceof OrthographicCamera ? [camera.left, camera.right, camera.top, camera.bottom] : null,
          projection: camera.projectionMatrix.toArray(),
          canvasSize: [size.width, size.height],
        },
        calls: state.gl.info.render.calls,
        triangles: state.gl.info.render.triangles,
        frameMs: rawDelta * 1000,
      };
    }
  });

  const diagnosis = phase === 'diagnosis';
  return <>
    <group visible={!diagnosis}>
      <ambientLight intensity={1.4} />
      <hemisphereLight args={['#edf5ff', '#b8bdc8', 1.6]} />
      <directionalLight position={[-5, 14, 9]} intensity={3.1} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-12} shadow-camera-right={12} shadow-camera-top={12} shadow-camera-bottom={-12} shadow-normalBias={0.035} />
      <directionalLight position={[8, 10, -8]} intensity={1.7} color="#c9e1ff" />
      <primitive object={scene} dispose={null} />
      <group ref={patient} visible={phase !== 'completed'} position={phase === 'exiting' ? patientOutboundPath[0] : patientStart} rotation={[0, Math.PI, 0]}>
        <Character kind="patient" animation={patientMoving ? 'Walk' : patientSpeaking ? 'Talk' : 'Idle'} speed={patientSpeed} onLoaded={onPatientLoaded} />
        {phase === 'waiting' && <Html position={[0, 1.95, 0]} center style={{ pointerEvents: 'none', whiteSpace: 'nowrap' }}><div style={{ background: '#ffffffed', color: '#235587', border: '1px solid #bed6ed', borderRadius: 18, padding: '6px 12px', fontSize: 12, boxShadow: '0 4px 16px #12345b15' }}>王旭 · 等待接诊</div></Html>}
      </group>
      <DoctorController
        phase={phase}
        movementInput={movementInput}
        interactionRequest={interactionRequest}
        patient={patient}
        groupRef={doctor}
        staticWorld={staticWorld}
        dynamicColliders={() => [...doors.current.boxes, ...(phase === 'completed' ? [] : actorBox(patient.current))]}
        sightColliders={() => doors.current.boxes}
        door={doors}
        groundMeshes={scene}
        onLoaded={onDoctorLoaded}
        onInteract={onInteract}
        onInteractionChange={reportInteraction}
        onDoorInteractionChange={onDoorInteractionChange}
      />
      <EntranceDoors scene={scene} actors={[patient, doctor]} runtime={doors} paused={diagnosis} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[consultationPoint[0], 0.036, consultationPoint[2]]}>
        <ringGeometry args={[0.46, 0.49, 64]} /><meshBasicMaterial color="#3686ea" transparent opacity={0.45} depthWrite={false} />
      </mesh>
    </group>
    <OrbitControls onStart={() => { zoomTarget.current = null; }} ref={controls} enabled={!diagnosis} target={[0, 0.5, 0.5]} enablePan={false} minZoom={10} maxZoom={130} minPolarAngle={0.35} maxPolarAngle={1.15} />
  </>;
}
