'use client';

import { useRef, useEffect, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

function Character({ path }: { path: string }) {
  const { scene } = useGLTF(path);
  const ref = useRef<THREE.Group>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.clear();
      ref.current.add(scene.clone());
    }
  }, [scene]);

  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.2;
    }
  });

  return (
    <group ref={ref} position={[0, -1, 0]} scale={1.2}>
      <primitive object={scene} />
    </group>
  );
}

export default function AvatarCanvas({ path }: { path: string }) {
  return (
    <Canvas camera={{ position: [0, 1.5, 2.5], fov: 35 }}>
      <Suspense fallback={null}>
        <ambientLight intensity={1.2} />
        <directionalLight position={[2, 5, 3]} intensity={1.2} />
        <Character path={path} />
      </Suspense>
    </Canvas>
  );
}
