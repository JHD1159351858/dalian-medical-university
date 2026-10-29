import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { AnimationMixer, LinearFilter, Mesh, MeshStandardMaterial, LoopRepeat, type Object3D } from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

export type CharacterKind = 'patient' | 'doctor';
export type CharacterAnimation = 'Idle' | 'Walk' | 'Talk';

export function Character({ kind, animation = 'Idle', speed, onLoaded }: {
  kind: CharacterKind;
  animation?: CharacterAnimation;
  speed?: RefObject<number>;
  onLoaded?: (root: Object3D) => void;
}) {
  const asset = useGLTF(`/models/${kind}.glb`);
  const character = useMemo(() => {
    const instance = clone(asset.scene);
    instance.traverse((object) => {
      if (object instanceof Mesh) {
        object.castShadow = true; object.receiveShadow = true; object.frustumCulled = false;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => {
          if (!(material instanceof MeshStandardMaterial)) return;
          // The scan atlas has narrow UV islands; mipmaps blend their empty borders into distant hair.
          [material.map, material.normalMap, material.roughnessMap, material.metalnessMap].forEach((texture) => {
            if (!texture || texture.minFilter === LinearFilter) return;
            texture.generateMipmaps = false;
            texture.minFilter = LinearFilter;
            texture.needsUpdate = true;
          });
        });
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
    if (document.hidden) return;
    if (animation === 'Walk' && previous.current) previous.current.setEffectiveTimeScale(speed?.current ?? 1);
    mixer.update(Math.min(delta, 0.05));
  });
  return <primitive object={character} dispose={null} />;
}
