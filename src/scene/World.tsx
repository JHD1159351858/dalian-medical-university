import { Component, Suspense, useCallback, useEffect, useRef, useState, type ErrorInfo, type ReactNode, type RefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, View, useGLTF } from '@react-three/drei';
import { ACESFilmicToneMapping, OrthographicCamera, PCFSoftShadowMap, type PerspectiveCamera as PerspectiveCameraInstance } from 'three';
import { Character } from './Character';
import { HospitalScene, type HospitalSceneProps } from './HospitalScene';

type WorldProps = HospitalSceneProps & {
  patientView: RefObject<HTMLDivElement | null>; doctorView: RefObject<HTMLDivElement | null>;
  onError: (message: string) => void;
};

class SceneBoundary extends Component<{ children: ReactNode; onError: (message: string) => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, _info: ErrorInfo) { this.props.onError(`三维资源加载失败：${error.message}`); }
  render() { return this.state.failed ? null : this.props.children; }
}

function AvatarCamera({ kind, cameraRef }: { kind: 'patient' | 'doctor'; cameraRef: RefObject<PerspectiveCameraInstance | null> }) {
  const { size } = useThree();
  useEffect(() => {
    // A newly mounted View initially inherits the hospital camera. Never mutate it.
    const camera = cameraRef.current;
    if (!camera) return;
    const closePortrait = kind === 'doctor' || size.height < 220;
    camera.position.set(0, closePortrait ? 1.28 : 1.15, closePortrait ? 2.25 : 3.6);
    camera.lookAt(0, closePortrait ? 1.15 : 0.92, 0);
    camera.updateProjectionMatrix();
  }, [cameraRef, kind, size.height]);
  return null;
}

function PrepareFrame({ diagnosis }: { diagnosis: boolean }) {
  useFrame(({ gl, size, camera }) => {
    // View's cleanup prepares a portrait scissor using the root camera, including
    // its orthographic frustum. Restore both projection and GL viewport each frame.
    if (!diagnosis && camera instanceof OrthographicCamera) {
      const { width, height } = size;
      if (camera.left !== -width / 2 || camera.right !== width / 2 || camera.top !== height / 2 || camera.bottom !== -height / 2) {
        camera.left = -width / 2;
        camera.right = width / 2;
        camera.top = height / 2;
        camera.bottom = -height / 2;
        camera.updateProjectionMatrix();
      }
    }
    gl.setViewport(0, 0, size.width, size.height);
    gl.setScissor(0, 0, size.width, size.height);
    gl.setScissorTest(false);
    gl.autoClear = !diagnosis;
    gl.setClearColor('#eef3f8', 0);
    if (diagnosis) gl.clear(true, true, true);
  }, -1);
  return null;
}

function Portrait({ kind, speaking = false }: { kind: 'patient' | 'doctor'; speaking?: boolean }) {
  const cameraRef = useRef<PerspectiveCameraInstance>(null);
  return <>
    <PerspectiveCamera ref={cameraRef} makeDefault position={[0, 1.15, 3.6]} fov={32} />
    <AvatarCamera kind={kind} cameraRef={cameraRef} />
    <ambientLight intensity={2} />
    <hemisphereLight args={['#ffffff', '#ccd3df', 1.5]} />
    <directionalLight position={[-3, 6, 5]} intensity={3} />
    <directionalLight position={[3, 2, -3]} intensity={1.4} color="#bedbff" />
    <group rotation={[0, kind === 'patient' ? 0.08 : -0.12, 0]}><Character kind={kind} animation={speaking ? 'Talk' : 'Idle'} /></group>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
      <circleGeometry args={[0.68, 64]} /><meshBasicMaterial color="#dfe7f1" transparent opacity={0.45} />
    </mesh>
  </>;
}

export default function World(props: WorldProps) {
  const diagnosis = props.phase === 'diagnosis';
  const [viewsReady, setViewsReady] = useState(false);
  useEffect(() => { setViewsReady(Boolean(props.patientView.current && props.doctorView.current)); }, [diagnosis, props.patientView, props.doctorView]);
  const reportError = useCallback((message: string) => props.onError(message), [props.onError]);
  return <SceneBoundary onError={reportError}>
    <Canvas className="world-canvas" orthographic camera={{ position: [14, 17, 22], zoom: 35, near: 0.1, far: 200 }}
      dpr={[1, 1]} shadows={{ type: PCFSoftShadowMap }} gl={{ antialias: false, alpha: true, powerPreference: 'high-performance', toneMapping: ACESFilmicToneMapping }}
      style={{ position: 'absolute', inset: 0, pointerEvents: diagnosis ? 'none' : 'auto' }}
      onCreated={({ gl }) => { gl.setClearColor('#eef3f8', 0); gl.toneMappingExposure = 1; }}
      fallback={<div className="webgl-fallback">当前浏览器无法显示三维场景，请启用硬件加速后重试。</div>}>
      <Suspense fallback={null}>
        <PrepareFrame diagnosis={diagnosis} />
        <HospitalScene {...props} />
        {diagnosis && viewsReady && <>
          <View track={props.patientView as RefObject<HTMLDivElement>} index={1}><Portrait kind="patient" speaking={props.patientSpeaking} /></View>
          <View track={props.doctorView as RefObject<HTMLDivElement>} index={2}><Portrait kind="doctor" /></View>
        </>}
      </Suspense>
    </Canvas>
  </SceneBoundary>;
}

export function clearModelCache() {
  ['/models/hospital.glb', '/models/patient.glb', '/models/doctor.glb'].forEach((url) => useGLTF.clear(url));
}
