import { dist } from "./math";
import type { Body, PlanetArtifact, Vec2 } from "./types";

/** Pickup radius around the artifact (not the planet). */
export const ARTIFACT_HARVEST_RADIUS = 22;
export const ARTIFACT_VISUAL_RADIUS = 7;

export function artifactWorldPos(planet: Body): Vec2 | null {
  if (!planet.artifact || planet.kind !== "planet") return null;
  const r = planet.radius * planet.artifact.surface;
  return {
    x: planet.x + Math.cos(planet.artifact.angle) * r,
    y: planet.y + Math.sin(planet.artifact.angle) * r,
  };
}

export function defaultArtifact(rng: () => number, value = 15): PlanetArtifact {
  return {
    angle: rng() * Math.PI * 2,
    surface: 0.72 + rng() * 0.2,
    value,
  };
}

export function tryHarvestArtifact(
  ship: Vec2,
  planet: Body,
  collected: ReadonlySet<string>
): number | null {
  if (planet.kind !== "planet" || !planet.artifact) return null;
  if (collected.has(planet.id)) return null;

  const pos = artifactWorldPos(planet);
  if (!pos) return null;

  if (dist(ship, planet) <= planet.radius * 0.9) return null;

  if (dist(ship, pos) > ARTIFACT_HARVEST_RADIUS) return null;

  return planet.artifact.value;
}
