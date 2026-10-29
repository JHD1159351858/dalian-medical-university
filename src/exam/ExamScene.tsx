import { ContactShadows, PerspectiveCamera } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { useRef } from 'react'
import { Mesh, type Group } from 'three'
import { Character } from '../scene/Character'
import type { PalpationResponse } from './palpation'

export function ExamScene({ response, pressing }: { response: PalpationResponse | null; pressing: boolean }) {
  return <Canvas className="exam-scene-canvas" dpr={[1, 1.5]} shadows={{ type: 2 }}>
    <color attach="background" args={['#eaf1fb']} />
    <ambientLight intensity={1.8} />
    <hemisphereLight args={['#ffffff', '#b8c9df', 1.7]} />
    <directionalLight position={[-3, 6, 4]} intensity={2.8} castShadow shadow-mapSize={[1024, 1024]} />
    <directionalLight position={[4, 3, -3]} intensity={1.3} color="#bfd7fa" />
    <PerspectiveCamera makeDefault position={[2.15, 3.8, 3.1]} fov={32} onUpdate={(camera) => camera.lookAt(0, 0.72, 0.35)} />
    <ExamBed />
    <group position={[-0.2, 0.82, 0.65]} rotation={[-Math.PI / 2, 0, 0]}>
      <PainBody response={response} pressing={pressing} />
    </group>
    <ContactShadows position={[0, 0.06, 0.45]} opacity={0.13} scale={5} blur={2.8} far={4} />
  </Canvas>
}

export function PatientPortrait() {
  return <Canvas className="exam-scene-canvas" dpr={[1, 1.5]}>
    <ambientLight intensity={2} />
    <hemisphereLight args={['#ffffff', '#bdcfea', 1.8]} />
    <directionalLight position={[-2, 5, 4]} intensity={2.8} />
    <PerspectiveCamera makeDefault position={[0, 1.3, 2.3]} fov={32} onUpdate={(camera) => camera.lookAt(0, 1.12, 0)} />
    <group position={[0, 0, 0]}><Character kind="patient" animation="Idle" /></group>
  </Canvas>
}

function ExamBed() {
  return <group>
    <mesh position={[0, 0.52, 0.35]} castShadow receiveShadow>
      <boxGeometry args={[1.25, 0.16, 2.35]} />
      <meshStandardMaterial color="#bfd1e9" roughness={0.72} />
    </mesh>
    <mesh position={[0, 0.64, 0.35]} castShadow receiveShadow>
      <boxGeometry args={[1.14, 0.16, 2.2]} />
      <meshStandardMaterial color="#f9fbff" roughness={0.8} />
    </mesh>
    <mesh position={[0, 0.75, -0.67]} castShadow receiveShadow>
      <boxGeometry args={[0.9, 0.11, 0.54]} />
      <meshStandardMaterial color="#dce8f8" roughness={0.8} />
    </mesh>
    <mesh position={[0, 0.15, 0.35]} receiveShadow>
      <boxGeometry args={[1.03, 0.12, 2.06]} />
      <meshStandardMaterial color="#d1deef" roughness={0.9} />
    </mesh>
    {[-0.43, 0.43].flatMap((x) => [-0.65, 1.34].map((z) => <mesh key={`${x}-${z}`} position={[x, 0.26, z]} castShadow>
      <cylinderGeometry args={[0.05, 0.05, 0.32, 16]} />
      <meshStandardMaterial color="#adc1da" roughness={0.8} />
    </mesh>))}
  </group>
}

function PainBody({ response, pressing }: { response: PalpationResponse | null; pressing: boolean }) {
  const group = useRef<Group>(null)
  const mesh = useRef<Mesh>(null)
  const active = pressing || response?.expression === 'pain' || response?.expression === 'severe-pain'
  return <group ref={group}>
    <Character kind="patient" animation="Idle" />
    {active && <mesh ref={mesh} position={[0, 0.03, 0.32]} rotation={[Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.07, response?.expression === 'severe-pain' ? 0.12 : 0.1, 40]} />
      <meshBasicMaterial color={response?.expression === 'severe-pain' ? '#cf756a' : '#dda197'} transparent opacity={0.72} />
    </mesh>}
  </group>
}
