'use client';

import { useRef, useEffect, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, useGLTF, useProgress, Html } from '@react-three/drei';
import * as THREE from 'three';
import type { Phase } from '@/app/training/flow';

interface WorldProps {
  phase: Phase;
  patientSpeaking: boolean;
  onReady: () => void;
  onArrive: () => void;
  onDepart: () => void;
  onInteract: () => void;
  onInteractionChange: (canInteract: boolean) => void;
  onError: (error: string) => void;
}

function Loading() {
  const { progress } = useProgress();
  return (
    <Html center>
      <div className="text-sm text-[#70878f]">载入中 {Math.round(progress)}%</div>
    </Html>
  );
}

function HospitalModel() {
  const { scene } = useGLTF('/models/hospital.glb');
  return <primitive object={scene} />;
}

function CharacterModel({ path, position, speaking }: { path: string; position: [number, number, number]; speaking?: boolean }) {
  const { scene } = useGLTF(path);
  const ref = useRef<THREE.Group>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.clear();
      ref.current.add(scene.clone());
    }
  }, [scene]);

  useFrame((state) => {
    if (ref.current && speaking) {
      ref.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 8) * 0.01;
    }
  });

  return (
    <group ref={ref} position={position}>
      {speaking && (
        <Html center distanceFactor={10}>
          <div className="rounded-full bg-white px-2 py-1 text-xs shadow">说话中</div>
        </Html>
      )}
    </group>
  );
}

function Scene({ phase, onReady, onArrive, onError }: { phase: Phase; onReady: () => void; onArrive: () => void; onError: (error: string) => void }) {
  useEffect(() => {
    onReady();
    const timer = setTimeout(() => {
      if (phase === 'walking') onArrive();
    }, 4000);
    return () => clearTimeout(timer);
  }, [phase, onReady, onArrive]);

  return (
    <>
      <ambientLight intensity={0.8} />
      <directionalLight position={[5, 10, 7]} intensity={1} />
      <HospitalModel />
      <CharacterModel path="/models/patient.glb" position={[0, 0, 2]} speaking={phase === 'patientSpeech'} />
      <CharacterModel path="/models/doctor.glb" position={[2, 0, 2]} />
      <OrbitControls target={[0, 1, 0]} maxPolarAngle={Math.PI / 2} />
    </>
  );
}

export function clearModelCache() {
  useGLTF.clear('/models/hospital.glb');
  useGLTF.clear('/models/patient.glb');
  useGLTF.clear('/models/doctor.glb');
}

export default function World({
  phase,
  patientSpeaking,
  onReady,
  onArrive,
  onDepart,
  onInteract,
  onInteractionChange,
  onError,
}: WorldProps) {
  useEffect(() => {
    onInteractionChange(phase === 'waiting');
  }, [phase, onInteractionChange]);

  useEffect(() => {
    if (phase === 'exiting') {
      const timer = setTimeout(onDepart, 4000);
      return () => clearTimeout(timer);
    }
  }, [phase, onDepart]);

  return (
    <div className="absolute inset-0">
      <Canvas camera={{ position: [5, 3, 8], fov: 50 }} fallback={<div className="flex h-full items-center justify-center text-[#70878f]">WebGL 不可用</div>}>
        <Suspense fallback={<Loading />}>
          <Scene phase={phase} onReady={onReady} onArrive={onArrive} onError={onError} />
        </Suspense>
      </Canvas>
    </div>
  );
}
