import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { AnimationMixer, LinearFilter, Mesh, MeshStandardMaterial, LoopRepeat, type Object3D } from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { patientModelUrl } from './patientModel';

export type CharacterKind = 'patient' | 'doctor';
export type CharacterAnimation = 'Idle' | 'Walk' | 'Talk';

export function Character({ kind, patientId, animation = 'Idle', speed, onLoaded, still = false }: {
  kind: CharacterKind;
  patientId?: string;
  animation?: CharacterAnimation;
  speed?: RefObject<number>;
  still?: boolean;
  onLoaded?: (root: Object3D) => void;
}) {
  const modelUrl = kind === 'patient' ? patientModelUrl(patientId) : '/models/doctor.glb';
  const asset = useGLTF(modelUrl);
  const character = useMemo(() => {
    const instance = clone(asset.scene);
    instance.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.castShadow = true;
      object.receiveShadow = true;
      object.frustumCulled = false;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!(material instanceof MeshStandardMaterial)) continue;
        // Keep the original scan atlases from bleeding into adjoining UV islands.
        for (const texture of [material.map, material.normalMap, material.roughnessMap, material.metalnessMap]) {
          if (!texture || texture.minFilter === LinearFilter) continue;
          texture.generateMipmaps = false;
          texture.minFilter = LinearFilter;
          texture.needsUpdate = true;
        }
      }
    });
    return instance;
  }, [asset.scene]);
  const mixer = useMemo(() => new AnimationMixer(character), [character]);
  const previous = useRef<ReturnType<AnimationMixer['clipAction']> | null>(null);

  useEffect(() => { onLoaded?.(character); }, [character, onLoaded]);
  useEffect(() => {
    const clip = asset.animations.find((item) => item.name === animation);
    if (!clip) throw new Error(`${kind} 缺少 ${animation} 骨骼动画`);
    const action = mixer.clipAction(clip).setLoop(LoopRepeat, Infinity);
    action.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(0.25).play();
    if (previous.current && previous.current !== action) previous.current.fadeOut(0.25);
    previous.current = action;
    return () => { action.fadeOut(0.2); };
  }, [animation, asset.animations, kind, mixer]);
  useEffect(() => () => { mixer.stopAllAction(); mixer.uncacheRoot(character); }, [mixer, character]);
  useFrame((_, delta) => {
    if (document.hidden || still) return;
    if (animation === 'Walk' && previous.current) previous.current.setEffectiveTimeScale(speed?.current ?? 1);
    mixer.update(Math.min(delta, 0.05));
  });
  return <primitive object={character} dispose={null} />;
}
