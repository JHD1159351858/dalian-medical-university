import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Group, OrthographicCamera } from 'three';
import { expect, it, vi } from 'vitest';
import { HospitalScene, type HospitalSceneProps } from '../src/scene/HospitalScene';
import { patientInboundPath, patientOutboundPath } from '../src/scene/navigation';

vi.mock('@react-three/fiber', () => ({
  useFrame: () => {},
  useThree: () => ({ camera: new OrthographicCamera(), size: { width: 1920, height: 1080 } }),
}));
vi.mock('@react-three/drei', () => ({
  useGLTF: () => ({ scene: new Group() }),
  Html: () => null,
  OrbitControls: () => null,
}));
vi.mock('../src/scene/Character', () => ({ Character: () => null }));
vi.mock('../src/scene/DoctorController', () => ({ DoctorController: () => null }));

const noop = () => {};
function initialPatientPosition(phase: HospitalSceneProps['phase']) {
  // Three.js scene elements are serialized only to inspect their initial props.
  const warning = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const html = renderToStaticMarkup(createElement(HospitalScene, {
      phase, patientSpeaking: false, movementInput: { current: { x: 0, y: 0 } }, interactionRequest: 0,
      onReady: noop, onArrive: noop, onDepart: noop, onInteract: noop,
      onInteractionChange: noop, onDoorInteractionChange: noop,
    }));
    return html.match(/<group[^>]*position="([^"]+)"[^>]*rotation=/)?.[1].split(',').map(Number);
  } finally {
    warning.mockRestore();
  }
}

it('starts a remounted departing patient at the consultation end of the outbound route', () => {
  expect(initialPatientPosition('exiting')).toEqual(patientOutboundPath[0]);
});

it('keeps an arriving patient at the outdoor start of the inbound route', () => {
  expect(initialPatientPosition('walking')).toEqual(patientInboundPath[0]);
});
