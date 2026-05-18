import { simulateTrajectory } from "./physics";
import type { Body, PreviewPath, PreviewSegment, Vec2 } from "./types";

export function simulatePreviewPath(
  start: Vec2,
  aimAngle: number,
  power: number,
  powerScale: number,
  bodies: Body[],
  bounds: { w: number; h: number }
): PreviewPath {
  const speed = power * powerScale; // powerScale includes thrust penalty when damaged
  const velocity = {
    x: Math.cos(aimAngle) * speed,
    y: Math.sin(aimAngle) * speed,
  };

  const result = simulateTrajectory(start, velocity, bodies, bounds);

  let outcome: PreviewSegment["outcome"] = "timeout";
  if (result.type === "captured") outcome = "captured";
  else if (result.type === "crashed") outcome = "crashed";
  else if (result.type === "escaped") outcome = "escaped";

  return { segments: [{ points: result.trail, outcome }] };
}
