import { defaultArtifact } from "./artifacts";
import { REF_H } from "./fitLevel";
import { applyWorldBounds, marginFor, type NormalizedBody, type NormalizedLevelDef } from "./levelLayout";
import { dist, len, sub } from "./math";
import { simulateTrajectory } from "./physics";
import type { Body, Level, Vec2 } from "./types";
import { effectiveSectorRange, type SectorProfile } from "./sector";

const POWER_SCALE = 1.95;

const PLANET_COLORS = [
  "#3a8f5c",
  "#c45c3a",
  "#3a7fc4",
  "#8f8f3a",
  "#3a8f8f",
  "#c43a6b",
  "#8f6b3a",
  "#7a5cff",
];

export type GenerateOptions = {
  seed: number;
  displayIndex?: number;
  worldW: number;
  worldH: number;
  profile: SectorProfile;
  viewportMinPx?: number;
};

function mulberry32(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, items: T[]): T {
  return items[Math.floor(rng() * items.length)]!;
}

function overlaps(a: { x: number; y: number; radius: number }, b: { x: number; y: number; radius: number }, pad: number): boolean {
  return dist(a, b) < a.radius + b.radius + pad;
}

function inBounds(p: Vec2, r: number, w: number, h: number, margin: number): boolean {
  return p.x - r >= margin && p.x + r <= w - margin && p.y - r >= margin && p.y + r <= h - margin;
}

function pickStart(rng: () => number, w: number, h: number, margin: number): Vec2 {
  const edge = Math.floor(rng() * 4);
  const t = margin + rng() * (edge % 2 === 0 ? w - margin * 2 : h - margin * 2);
  switch (edge) {
    case 0:
      return { x: margin, y: t };
    case 1:
      return { x: w - margin, y: t };
    case 2:
      return { x: t, y: margin };
    default:
      return { x: t, y: h - margin };
  }
}

function pickBlackHole(
  rng: () => number,
  w: number,
  h: number,
  margin: number,
  start: Vec2,
  range: number
): Vec2 {
  const minDist = 260 * range;
  const maxDist = 520 * range;
  for (let i = 0; i < 40; i++) {
    const p = {
      x: margin + 40 + rng() * (w - margin * 2 - 80),
      y: margin + 40 + rng() * (h - margin * 2 - 80),
    };
    const d = dist(p, start);
    if (d > minDist && d < maxDist) return p;
  }
  return { x: w - 100, y: h * 0.25 + rng() * h * 0.5 };
}

function planetBetween(start: Vec2, hole: Vec2, planet: Vec2, range: number): boolean {
  const ab = sub(hole, start);
  const ap = sub(planet, start);
  const abLen = len(ab);
  if (abLen < 1) return false;
  const t = (ap.x * ab.x + ap.y * ab.y) / (abLen * abLen);
  if (t < 0.12 || t > 0.88) return false;
  return dist(planet, { x: start.x + ab.x * t, y: start.y + ab.y * t }) < 120 * range;
}

function isSolvable(level: Level): boolean {
  const hole = level.bodies.find((b) => b.kind === "blackhole");
  if (!hole) return false;

  const bounds = { w: level.width, h: level.height };
  const maxSpeed = 100 * POWER_SCALE;

  const tryShot = (from: Vec2, angle: number): boolean => {
    const vel = { x: Math.cos(angle) * maxSpeed, y: Math.sin(angle) * maxSpeed };
    const result = simulateTrajectory(from, vel, level.bodies, bounds);
    if (result.type === "captured") return true;
    if (result.type === "stopped") {
      const toHole = sub(hole, result.position);
      if (len(toHole) < hole.radius * 2) return false;
      const angle2 = Math.atan2(toHole.y, toHole.x);
      const vel2 = { x: Math.cos(angle2) * maxSpeed, y: Math.sin(angle2) * maxSpeed };
      const r2 = simulateTrajectory(result.position, vel2, level.bodies, bounds);
      return r2.type === "captured";
    }
    return false;
  };

  for (let i = 0; i < 20; i++) {
    const angle = (i / 20) * Math.PI * 2;
    if (tryShot(level.start, angle)) return true;
  }

  const toHole = Math.atan2(hole.y - level.start.y, hole.x - level.start.x);
  for (const spread of [-0.45, -0.22, 0, 0.22, 0.45]) {
    if (tryShot(level.start, toHole + spread)) return true;
  }

  return false;
}

function toNormalized(
  bodies: Body[],
  start: Vec2,
  worldW: number,
  worldH: number
): { startNx: number; startNy: number; bodies: NormalizedBody[] } {
  const scaleR = Math.min(worldW, worldH);
  return {
    startNx: start.x / worldW,
    startNy: start.y / worldH,
    bodies: bodies.map((b) => ({
      id: b.id,
      nx: b.x / worldW,
      ny: b.y / worldH,
      nr: b.radius / scaleR,
      mass: b.mass,
      kind: b.kind,
      color: b.color,
      artifact: b.artifact,
    })),
  };
}

function tryGenerate(
  seed: number,
  displayIndex: number,
  worldW: number,
  worldH: number,
  profile: SectorProfile,
  viewportMinPx: number
): Level | null {
  const rng = mulberry32(seed);
  const margin = marginFor(worldW, worldH);
  const range = effectiveSectorRange(profile, viewportMinPx);
  const difficulty = Math.min(3, Math.floor(seed / 7) % 4);
  const planetCount =
    2 + Math.floor(rng() * 3) + (difficulty > 1 ? 1 : 0) + Math.floor(profile.density - 1);

  const start = pickStart(rng, worldW, worldH, margin);
  const holePos = pickBlackHole(rng, worldW, worldH, margin, start, range);
  const holeRadius = (24 + Math.floor(rng() * 8)) * (0.92 + range * 0.04);
  const holeMass = 17500 + Math.floor(rng() * 5500);

  const bodies: Body[] = [
    {
      id: "bh",
      x: holePos.x,
      y: holePos.y,
      radius: holeRadius,
      mass: holeMass,
      kind: "blackhole",
      color: pick(rng, ["#6b4cff", "#8b5cf6", "#a78bfa", "#5b21b6"]),
    },
  ];

  const padScale = 28 * (0.85 + range * 0.08);

  for (let i = 0; i < planetCount; i++) {
    let placed = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      const radius = (26 + Math.floor(rng() * 20)) * (0.95 + range * 0.03);
      const mass = 6500 + radius * 160 + Math.floor(rng() * 3500);
      const candidate: Body = {
        id: `p${i}`,
        x: margin + radius + rng() * (worldW - 2 * margin - 2 * radius),
        y: margin + radius + rng() * (worldH - 2 * margin - 2 * radius),
        radius,
        mass,
        kind: "planet",
        color: PLANET_COLORS[i % PLANET_COLORS.length]!,
        artifact: defaultArtifact(rng, 10 + Math.floor(rng() * 18)),
      };

      if (!inBounds(candidate, candidate.radius, worldW, worldH, margin)) continue;
      if (dist(candidate, start) < candidate.radius + 64 * range) continue;
      if (dist(candidate, holePos) < candidate.radius + holeRadius + 48 * range) continue;

      let ok = true;
      for (const other of bodies) {
        if (overlaps(candidate, other, padScale)) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;

      bodies.push(candidate);
      placed = true;
      break;
    }
    if (!placed) return null;
  }

  const planets = bodies.filter((b) => b.kind === "planet");
  if (!planets.some((p) => planetBetween(start, holePos, p, range))) return null;

  const norm = toNormalized(bodies, start, worldW, worldH);
  const def: NormalizedLevelDef = {
    id: `gen-${seed}`,
    name: `SECTOR ${String(displayIndex + 1).padStart(2, "0")}`,
    startNx: norm.startNx,
    startNy: norm.startNy,
    bodies: norm.bodies,
    par: 2 + planets.length + (difficulty > 2 ? 1 : 0) + profile.parBias,
    seed,
    generated: true,
  };

  const level = applyWorldBounds(def, worldW, worldH);
  return isSolvable(level) ? level : null;
}

function fallbackDef(displayIndex: number, baseSeed: number): NormalizedLevelDef {
  return {
    id: `gen-fallback-${baseSeed}`,
    name: `SECTOR ${String(displayIndex + 1).padStart(2, "0")}`,
    startNx: 80 / 800,
    startNy: 0.5,
    par: 3,
    seed: baseSeed,
    generated: true,
    bodies: [
      {
        id: "p1",
        nx: 380 / 800,
        ny: 0.5,
        nr: 38 / REF_H,
        mass: 12000,
        kind: "planet",
        color: "#3a8f5c",
        artifact: { angle: 0.6, surface: 0.85, value: 15 },
      },
      {
        id: "bh",
        nx: 680 / 800,
        ny: 0.5,
        nr: 28 / REF_H,
        mass: 19000,
        kind: "blackhole",
        color: "#8b5cf6",
      },
    ],
  };
}

export function generateLevel(options: GenerateOptions): Level {
  const baseSeed = options.seed;
  const displayIndex = options.displayIndex ?? baseSeed;
  const { worldW, worldH, profile } = options;
  const viewportMinPx = options.viewportMinPx ?? 600;

  for (let attempt = 0; attempt < 48; attempt++) {
    const level = tryGenerate(
      baseSeed + attempt * 9973,
      displayIndex,
      worldW,
      worldH,
      profile,
      viewportMinPx
    );
    if (level) return level;
  }

  return applyWorldBounds(fallbackDef(displayIndex, baseSeed), worldW, worldH);
}
