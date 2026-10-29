import { describe, expect, it } from 'vitest';
import {
  advanceAlongPath,
  closedDoorObstacles,
  consultationPoint,
  findPath,
  isSegmentClear,
  navigationGraph,
  patientInboundPath,
  patientOutboundPath,
  patientStart,
  staticObstacles,
} from '../src/scene/navigation';

describe('hospital navigation', () => {
  it('takes the open right-hand entrance and reaches the doctor without crossing furniture', () => {
    const path = findPath(navigationGraph, 'start', 'consultation');
    expect(path[0]).toEqual(patientStart);
    expect(path.at(-1)).toEqual(consultationPoint);
    expect(path.length).toBeGreaterThan(2);
    for (let i = 1; i < path.length; i++) expect(isSegmentClear(path[i - 1], path[i], staticObstacles, 0.27)).toBe(true);
  });
  it('rejects a direct route through the reception desk', () => {
    expect(isSegmentClear([-4, 0, 4.5], [-4, 0, 1], staticObstacles, 0.27)).toBe(false);
  });
  it('returns no path when the destination is disconnected', () => {
    expect(findPath({ a: { position: [0, 0, 0], neighbors: [] }, b: { position: [1, 0, 0], neighbors: [] } }, 'a', 'b')).toEqual([]);
  });

  it('models both entrance leaves as closed blockers', () => {
    expect(closedDoorObstacles).toHaveLength(2);
    expect(isSegmentClear([0.55, 0.031, 6.3], [0.55, 0.031, 5.05], closedDoorObstacles, 0.27)).toBe(false);
    expect(isSegmentClear([-0.55, 0.031, 6.3], [-0.55, 0.031, 5.05], closedDoorObstacles, 0.27)).toBe(false);
  });

  it('uses one fixed inbound route and reverses it back to the welcome mat', () => {
    expect(patientInboundPath[0]).toEqual(patientStart);
    expect(patientInboundPath[1][2]).toBeCloseTo(6.3);
    expect(patientInboundPath.at(-1)).toEqual(consultationPoint);
    expect(patientOutboundPath).toEqual([...patientInboundPath].reverse());
    expect(patientOutboundPath.at(-1)).toEqual(patientStart);
  });

  it('pauses path progress when the next movement is blocked', () => {
    const blocked = advanceAlongPath(patientInboundPath[1], patientInboundPath, 2, 0.4, () => false);
    expect(blocked.position).toEqual(patientInboundPath[1]);
    expect(blocked.index).toBe(2);
    expect(blocked.distance).toBe(0);
  });
});
