import { dist, sub } from "./math";
import { G } from "./physics";
import type { Asteroid, Body, Level, Vec2 } from "./types";

export const THRUST_PENALTY = 0.25;
export const SPEED_PENALTY = 0.25;
const COURSE_DEV_MIN = 0.4;
const COURSE_DEV_MAX = 1.15;

/** Stronger than ship gravity so bends are visible at asteroid speeds. */
const ASTEROID_G_MULT = 5;
const ASTEROID_SOFTEN_K = 0.12;
const ASTEROID_MAX_SPEED = 105;
const ASTEROID_SURFACE_PAD = 1;
const ASTEROID_BOUNCE_REST = 0.92;
const ASTEROID_BOUNCE_EXTRA_PAD = 4;
const SHIP_HIT_RADIUS = 5;

const ASTEROID_TINT_COUNT = 6;

function buildShapeRadii(rng: () => number): number[] {
  const count = 5 + Math.floor(rng() * 4);
  const radii: number[] = [];
  for (let i = 0; i < count; i++) {
    radii.push(0.52 + rng() * 0.48);
  }
  return radii;
}

function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function mulberry32(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function overlapsBody(a: Asteroid, bodies: Body[]): boolean {
  for (const b of bodies) {
    if (dist(a, b) < a.radius + b.radius + 12) return true;
  }
  return false;
}

function nearestPlanetGap(pos: Vec2, bodies: Body[]): number {
  let min = Infinity;
  for (const b of bodies) {
    if (b.kind !== "planet") continue;
    const gap = dist(pos, b) - b.radius;
    if (gap < min) min = gap;
  }
  return min;
}

function planetGravityAccel(pos: Vec2, bodies: Body[]): Vec2 {
  let ax = 0;
  let ay = 0;
  for (const b of bodies) {
    if (b.kind !== "planet") continue;
    const d = sub(b, pos);
    const soften2 = (b.radius * ASTEROID_SOFTEN_K) ** 2;
    const r2 = d.x * d.x + d.y * d.y + soften2;
    const r = Math.sqrt(r2);
    const f = (G * ASTEROID_G_MULT * b.mass) / r2;
    ax += (f * d.x) / r;
    ay += (f * d.y) / r;
  }
  return { x: ax, y: ay };
}

function asteroidSubsteps(pos: Vec2, bodies: Body[]): number {
  const gap = nearestPlanetGap(pos, bodies);
  if (gap > 160) return 1;
  if (gap < 30) return 6;
  if (gap < 80) return 4;
  if (gap < 140) return 2;
  return 1;
}

/** Bounce off planet surfaces without sticking. */
function resolvePlanetCollisions(a: Asteroid, bodies: Body[]) {
  for (const b of bodies) {
    if (b.kind !== "planet") continue;

    const d = sub(a, b);
    let distCenter = Math.hypot(d.x, d.y);
    const minDist = b.radius + a.radius + ASTEROID_SURFACE_PAD;

    if (distCenter >= minDist) continue;

    let nx: number;
    let ny: number;
    if (distCenter < 0.01) {
      const angle = a.rotation || Math.random() * Math.PI * 2;
      nx = Math.cos(angle);
      ny = Math.sin(angle);
      distCenter = 0.01;
    } else {
      nx = d.x / distCenter;
      ny = d.y / distCenter;
    }

    const vDotN = a.vx * nx + a.vy * ny;
    const impactSpeed = Math.max(0, -vDotN);

    a.x = b.x + nx * (minDist + ASTEROID_BOUNCE_EXTRA_PAD);
    a.y = b.y + ny * (minDist + ASTEROID_BOUNCE_EXTRA_PAD);

    if (vDotN < 0) {
      const rest = ASTEROID_BOUNCE_REST + Math.min(0.28, impactSpeed / 100);
      a.vx -= (1 + rest) * vDotN * nx;
      a.vy -= (1 + rest) * vDotN * ny;

      const tx = -ny;
      const ty = nx;
      const slide = (Math.random() - 0.5) * impactSpeed * 0.65;
      a.vx += tx * slide;
      a.vy += ty * slide;
    }

    const outward = a.vx * nx + a.vy * ny;
    const needOut = Math.max(26, impactSpeed * 0.62);
    if (outward < needOut) {
      a.vx += nx * (needOut - outward);
      a.vy += ny * (needOut - outward);
    }
  }
}

function clampAsteroidSpeed(a: Asteroid) {
  const speed = Math.hypot(a.vx, a.vy);
  if (speed > ASTEROID_MAX_SPEED) {
    a.vx = (a.vx / speed) * ASTEROID_MAX_SPEED;
    a.vy = (a.vy / speed) * ASTEROID_MAX_SPEED;
  }
}

export function spawnAsteroids(level: Level): Asteroid[] {
  const seed = level.seed ?? hashSeed(level.id);
  const rng = mulberry32(seed ^ 0xa57e);
  const count = 10 + Math.floor(rng() * 8);
  const asteroids: Asteroid[] = [];

  for (let i = 0; i < count; i++) {
    let placed = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      const radius = 3 + rng() * 3;
      const angle = rng() * Math.PI * 2;
      const speed = 28 + rng() * 52;
      const candidate: Asteroid = {
        id: `a${i}`,
        x: 40 + rng() * (level.width - 80),
        y: 40 + rng() * (level.height - 80),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius,
        rotation: rng() * Math.PI * 2,
        spin: (rng() - 0.5) * 5,
        shapeRadii: buildShapeRadii(rng),
        tint: Math.floor(rng() * ASTEROID_TINT_COUNT),
      };

      if (dist(candidate, level.start) < 72) continue;
      if (overlapsBody(candidate, level.bodies)) continue;

      asteroids.push(candidate);
      placed = true;
      break;
    }
    if (!placed) continue;
  }

  return asteroids;
}

export function stepAsteroids(
  asteroids: Asteroid[],
  bodies: Body[],
  bounds: { width: number; height: number },
  dt: number
) {
  const { width: w, height: h } = bounds;
  for (const a of asteroids) {
    const steps = asteroidSubsteps(a, bodies);
    const subDt = dt / steps;

    for (let i = 0; i < steps; i++) {
      const g = planetGravityAccel(a, bodies);
      a.vx += g.x * subDt;
      a.vy += g.y * subDt;
      a.x += a.vx * subDt;
      a.y += a.vy * subDt;
      resolvePlanetCollisions(a, bodies);
    }

    clampAsteroidSpeed(a);
    a.rotation += a.spin * dt;

    if (a.x < -a.radius) a.x = w + a.radius;
    if (a.x > w + a.radius) a.x = -a.radius;
    if (a.y < -a.radius) a.y = h + a.radius;
    if (a.y > h + a.radius) a.y = -a.radius;
  }
}

export function hitAsteroid(ship: Vec2, asteroids: Asteroid[]): number | null {
  for (let i = 0; i < asteroids.length; i++) {
    const a = asteroids[i]!;
    if (dist(ship, a) <= SHIP_HIT_RADIUS + a.radius) return i;
  }
  return null;
}

export function removeAsteroid(asteroids: Asteroid[], index: number) {
  asteroids.splice(index, 1);
}

/** Cut speed and knock course; speedKeep is fraction of speed retained (see asteroidThrustRetention). */
export function applyAsteroidImpact(
  vel: Vec2,
  speedKeep = SPEED_PENALTY,
  rng: () => number = Math.random
): Vec2 {
  const speed = Math.hypot(vel.x, vel.y);
  if (speed < 0.5) return vel;

  const newSpeed = speed * speedKeep;
  const heading = Math.atan2(vel.y, vel.x);
  const sign = rng() < 0.5 ? -1 : 1;
  const deviation = sign * (COURSE_DEV_MIN + rng() * (COURSE_DEV_MAX - COURSE_DEV_MIN));
  const newHeading = heading + deviation;

  return {
    x: Math.cos(newHeading) * newSpeed,
    y: Math.sin(newHeading) * newSpeed,
  };
}
