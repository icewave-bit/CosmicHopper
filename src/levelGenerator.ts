import { defaultArtifact } from "./artifacts";
import { REF_H } from "./fitLevel";
import { applyWorldBounds, marginFor, type NormalizedBody, type NormalizedLevelDef } from "./levelLayout";
import { dist, len, sub } from "./math";
import { worldScaleMultiplier } from "./progress";
import { simulateTrajectory, type SimResult } from "./physics";
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
  displayName: string;
  worldW: number;
  worldH: number;
  profile: SectorProfile;
  sectorLevel: number;
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

/** Rough single-launch reach; full game allows chained jumps + slingshots. */
function routeReachCap(range: number, worldMult: number): number {
  const growth = 1 + 0.35 * Math.max(0, worldMult - 1);
  return 400 * range * growth;
}

function pickBlackHole(
  rng: () => number,
  w: number,
  h: number,
  margin: number,
  start: Vec2,
  range: number,
  worldMult: number
): Vec2 {
  const span = Math.min(w, h);
  const reach = routeReachCap(range, worldMult);
  const minDist = Math.min(240 * range, reach * 0.42);
  const maxDist = Math.min(span * 0.82, reach);
  for (let i = 0; i < 48; i++) {
    const p = {
      x: margin + 40 + rng() * (w - margin * 2 - 80),
      y: margin + 40 + rng() * (h - margin * 2 - 80),
    };
    const d = dist(p, start);
    if (d > minDist && d < maxDist) return p;
  }
  const angle = rng() * Math.PI * 2;
  const d = minDist + rng() * (maxDist - minDist);
  return {
    x: clampWorld(start.x + Math.cos(angle) * d, margin, w - margin),
    y: clampWorld(start.y + Math.sin(angle) * d, margin, h - margin),
  };
}

function clampWorld(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
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

function positionKey(p: Vec2): string {
  return `${Math.round(p.x / 24)}:${Math.round(p.y / 24)}`;
}

/** Matches gameplay: repeated aim + launch until capture (base engine power). */
function isSolvable(level: Level): boolean {
  const hole = level.bodies.find((b) => b.kind === "blackhole");
  if (!hole) return false;

  const bounds = { w: level.width, h: level.height };
  const maxSpeed = 100 * POWER_SCALE;
  const maxJumps = Math.max(8, level.par + 2);
  const angleSteps = 16;

  const tryShot = (from: Vec2, angle: number): SimResult => {
    const vel = { x: Math.cos(angle) * maxSpeed, y: Math.sin(angle) * maxSpeed };
    return simulateTrajectory(from, vel, level.bodies, bounds);
  };

  let frontier: Vec2[] = [level.start];
  const visited = new Set<string>([positionKey(level.start)]);

  for (let jump = 0; jump < maxJumps; jump++) {
    const next: Vec2[] = [];

    for (const from of frontier) {
      for (let i = 0; i < angleSteps; i++) {
        const angle = (i / angleSteps) * Math.PI * 2;
        const result = tryShot(from, angle);
        if (result.type === "captured") return true;
        if (result.type !== "stopped") continue;

        const key = positionKey(result.position);
        if (visited.has(key)) continue;
        if (dist(result.position, hole) < hole.radius * 1.5) continue;

        visited.add(key);
        next.push(result.position);
      }

      const toHole = Math.atan2(hole.y - from.y, hole.x - from.x);
      for (const spread of [-0.5, -0.25, 0, 0.25, 0.5]) {
        const result = tryShot(from, toHole + spread);
        if (result.type === "captured") return true;
        if (result.type !== "stopped") continue;
        const key = positionKey(result.position);
        if (visited.has(key)) continue;
        visited.add(key);
        next.push(result.position);
      }
    }

    if (next.length === 0) return false;
    frontier = next;
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
  displayName: string,
  worldW: number,
  worldH: number,
  profile: SectorProfile,
  sectorLevel: number,
  viewportMinPx: number
): Level | null {
  const rng = mulberry32(seed);
  const margin = marginFor(worldW, worldH);
  const range = effectiveSectorRange(profile, viewportMinPx);
  const worldMult = worldScaleMultiplier(sectorLevel);
  const bodyShrink = 1 / Math.cbrt(worldMult);
  const difficulty = Math.min(3, Math.floor(seed / 7) % 4);
  const planetCount = Math.min(
    12,
    2 +
      Math.floor(rng() * 3) +
      (difficulty > 1 ? 1 : 0) +
      Math.floor(profile.density - 1) +
      Math.floor((worldMult - 1) * 3)
  );

  const start = pickStart(rng, worldW, worldH, margin);
  const holePos = pickBlackHole(rng, worldW, worldH, margin, start, range, worldMult);
  const holeRadius = (24 + Math.floor(rng() * 8)) * (0.92 + range * 0.04) * bodyShrink;
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

  const padScale = 28 * (0.85 + range * 0.08) * bodyShrink;

  for (let i = 0; i < planetCount; i++) {
    let placed = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      const radius = (26 + Math.floor(rng() * 20)) * (0.95 + range * 0.03) * bodyShrink;
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
  const betweenCount = planets.filter((p) => planetBetween(start, holePos, p, range)).length;
  const needBetween = worldMult >= 1.45 ? 2 : 1;
  if (betweenCount < needBetween) return null;

  const norm = toNormalized(bodies, start, worldW, worldH);
  const def: NormalizedLevelDef = {
    id: `gen-${seed}`,
    name: displayName,
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

function fallbackDef(displayName: string, baseSeed: number): NormalizedLevelDef {
  return {
    id: `gen-fallback-${baseSeed}`,
    name: displayName,
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
  const { worldW, worldH, profile, displayName, sectorLevel } = options;
  const viewportMinPx = options.viewportMinPx ?? 600;
  const attempts = sectorLevel >= 20 ? 96 : 48;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const level = tryGenerate(
      baseSeed + attempt * 9973,
      displayName,
      worldW,
      worldH,
      profile,
      sectorLevel,
      viewportMinPx
    );
    if (level) return level;
  }

  const fallback = applyWorldBounds(fallbackDef(displayName, baseSeed), worldW, worldH);
  if (isSolvable(fallback)) return fallback;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const level = tryGenerate(
      baseSeed + 500_000 + attempt * 9973,
      displayName,
      worldW,
      worldH,
      profile,
      sectorLevel,
      viewportMinPx
    );
    if (level) return level;
  }

  return fallback;
}
