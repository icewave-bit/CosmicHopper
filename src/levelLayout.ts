import { REF_H } from "./fitLevel";
import type { Body, Level, PlanetArtifact, Vec2 } from "./types";

export type NormalizedBody = {
  id: string;
  nx: number;
  ny: number;
  /** Radius as fraction of REF_H (600). */
  nr: number;
  mass: number;
  kind: "planet" | "blackhole";
  color: string;
  artifact?: PlanetArtifact;
};

export type NormalizedLevelDef = {
  id: string;
  name: string;
  startNx: number;
  startNy: number;
  bodies: NormalizedBody[];
  par: number;
  seed?: number;
  generated?: boolean;
};

const MARGIN_FRAC = 56 / REF_H;

export function marginFor(worldW: number, worldH: number): number {
  return MARGIN_FRAC * Math.min(worldW, worldH);
}

function scaleRadius(nr: number, worldW: number, worldH: number): number {
  return nr * Math.min(worldW, worldH);
}

function placeBody(b: NormalizedBody, worldW: number, worldH: number): Body {
  return {
    id: b.id,
    x: b.nx * worldW,
    y: b.ny * worldH,
    radius: scaleRadius(b.nr, worldW, worldH),
    mass: b.mass,
    kind: b.kind,
    color: b.color,
    artifact: b.artifact,
  };
}

export function applyWorldBounds(def: NormalizedLevelDef, worldW: number, worldH: number): Level {
  return {
    id: def.id,
    name: def.name,
    width: worldW,
    height: worldH,
    start: { x: def.startNx * worldW, y: def.startNy * worldH },
    bodies: def.bodies.map((b) => placeBody(b, worldW, worldH)),
    par: def.par,
    seed: def.seed,
    generated: def.generated,
  };
}

/** Pixel coords on 800×600 reference → normalized def. */
export function normalizeFromRef(
  def: Omit<NormalizedLevelDef, "bodies"> & {
    start: Vec2;
    bodies: (Omit<NormalizedBody, "nx" | "ny" | "nr"> & {
      x: number;
      y: number;
      radius: number;
    })[];
  }
): NormalizedLevelDef {
  const refW = 800;
  const refH = REF_H;
  return {
    id: def.id,
    name: def.name,
    startNx: def.start.x / refW,
    startNy: def.start.y / refH,
    par: def.par,
    seed: def.seed,
    generated: def.generated,
    bodies: def.bodies.map((b) => ({
      id: b.id,
      nx: b.x / refW,
      ny: b.y / refH,
      nr: b.radius / refH,
      mass: b.mass,
      kind: b.kind,
      color: b.color,
      artifact: b.artifact,
    })),
  };
}
