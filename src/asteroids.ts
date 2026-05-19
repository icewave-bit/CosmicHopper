import { dist, sub } from "./math";
import { G } from "./physics";
import type { Asteroid, Body, Level, Vec2 } from "./types";
import { shieldDeflectRadius, shieldDeflectStrength } from "./upgrades";

export const THRUST_PENALTY = 0.25;
export const SPEED_PENALTY = 0.25;
const COURSE_DEV_MIN = 0.4;
const COURSE_DEV_MAX = 1.15;

/** Planet pull on asteroids — weak; heavy planets use compressed mass. */
const ASTEROID_G_MULT = 1.05;
const ASTEROID_SOFTEN_K = 0.18;
const ASTEROID_PLANET_MASS_REF = 12000;
const ASTEROID_ORBIT_BAND = 2.8;
/** Tangential flight in the band — gravity scaled down to limit capture orbits. */
const ASTEROID_ORBIT_GRAV_FADE = 0.82;
const ASTEROID_MAX_SPEED = 52;
const ASTEROID_SURFACE_PAD = 1;
/** Higher restitution — asteroids should ricochet off planets, not settle on them. */
const ASTEROID_BOUNCE_REST = 0.82;
const ASTEROID_BOUNCE_EXTRA_PAD = 3;
/** Min outward speed after a planet hit (counters gravity between substeps). */
const ASTEROID_BOUNCE_MIN_OUT = 32;
const ASTEROID_ASTEROID_REST = 0.55;
const ASTEROID_ASTEROID_PAD = 0.5;
export const SHIP_HIT_RADIUS = 5;

/** Head-on approach above this (0–1) — shield does not deflect. */
const DEFLECT_HEAD_ON_MAX = 0.7;
/** Full deflect below this speed; never drops below DEFLECT_SPEED_FLOOR at max asteroid speed. */
const DEFLECT_SPEED_SOFT = 55;
const DEFLECT_SPEED_FLOOR = 0.58;
const DEFLECT_ACCEL_MAX = 161;
const DEFLECT_SIZE_REF = 4.2;
const DEFLECT_SWERVE = 0.48;

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

function asteroidPlanetMass(mass: number): number {
  const ratio = mass / ASTEROID_PLANET_MASS_REF;
  return ASTEROID_PLANET_MASS_REF * ratio ** 0.42;
}

function planetGravityAccel(pos: Vec2, vel: Vec2, bodies: Body[]): Vec2 {
  let ax = 0;
  let ay = 0;
  const speed = Math.hypot(vel.x, vel.y);

  for (const b of bodies) {
    if (b.kind !== "planet") continue;
    const d = sub(b, pos);
    const soften2 = (b.radius * ASTEROID_SOFTEN_K) ** 2;
    const r2 = d.x * d.x + d.y * d.y + soften2;
    const r = Math.sqrt(r2);
    let f = (G * ASTEROID_G_MULT * asteroidPlanetMass(b.mass)) / r2;

    const gap = r - b.radius;
    const band = b.radius * ASTEROID_ORBIT_BAND;
    if (speed > 6 && gap < band) {
      const ux = d.x / r;
      const uy = d.y / r;
      const vOut = vel.x * ux + vel.y * uy;
      const vTanSq = Math.max(0, speed * speed - vOut * vOut);
      const tangential = vTanSq / (speed * speed);
      if (tangential > 0.45) {
        const bandT = 1 - gap / band;
        const fade = ASTEROID_ORBIT_GRAV_FADE * bandT * tangential;
        f *= Math.max(0.12, 1 - fade);
      }
    }

    // Near the surface, ease pull so weak bounces are not re-captured immediately.
    const skimBand = b.radius * 0.14;
    if (gap < skimBand && gap > 0) {
      f *= Math.max(0.2, gap / skimBand);
    }

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
      const rest = ASTEROID_BOUNCE_REST + Math.min(0.12, impactSpeed / 90);
      a.vx -= (1 + rest) * vDotN * nx;
      a.vy -= (1 + rest) * vDotN * ny;

      const tx = -ny;
      const ty = nx;
      const slide = (Math.random() - 0.5) * Math.max(impactSpeed, 20) * 0.55;
      a.vx += tx * slide;
      a.vy += ty * slide;
    }

    const outward = a.vx * nx + a.vy * ny;
    const needOut = Math.max(ASTEROID_BOUNCE_MIN_OUT, impactSpeed * 0.72);
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

function asteroidMass(a: Asteroid): number {
  return a.radius * a.radius;
}

function resolveAsteroidPair(a: Asteroid, b: Asteroid) {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  let distCenter = Math.hypot(dx, dy);
  const minDist = a.radius + b.radius + ASTEROID_ASTEROID_PAD;

  if (distCenter < 0.001) {
    const angle = Math.random() * Math.PI * 2;
    dx = Math.cos(angle);
    dy = Math.sin(angle);
    distCenter = 0.001;
  }

  if (distCenter >= minDist) return;

  const nx = dx / distCenter;
  const ny = dy / distCenter;
  const overlap = minDist - distCenter;
  const ma = asteroidMass(a);
  const mb = asteroidMass(b);
  const total = ma + mb;

  a.x -= (nx * overlap * mb) / total;
  a.y -= (ny * overlap * mb) / total;
  b.x += (nx * overlap * ma) / total;
  b.y += (ny * overlap * ma) / total;

  const rvx = b.vx - a.vx;
  const rvy = b.vy - a.vy;
  const relNormal = rvx * nx + rvy * ny;
  if (relNormal >= 0) return;

  const impulse = (-(1 + ASTEROID_ASTEROID_REST) * relNormal) / (1 / ma + 1 / mb);
  a.vx -= (impulse * nx) / ma;
  a.vy -= (impulse * ny) / ma;
  b.vx += (impulse * nx) / mb;
  b.vy += (impulse * ny) / mb;
}

function resolveAsteroidCollisions(asteroids: Asteroid[]) {
  for (let i = 0; i < asteroids.length; i++) {
    for (let j = i + 1; j < asteroids.length; j++) {
      resolveAsteroidPair(asteroids[i]!, asteroids[j]!);
    }
  }
}

export function spawnAsteroids(level: Level): Asteroid[] {
  const seed = level.seed ?? hashSeed(level.id);
  const rng = mulberry32(seed ^ 0xa57e);
  const count = Math.max(4, Math.round((10 + Math.floor(rng() * 8)) * 0.45));
  const asteroids: Asteroid[] = [];

  for (let i = 0; i < count; i++) {
    let placed = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      const radius = 3 + rng() * 3;
      const angle = rng() * Math.PI * 2;
      const speed = (28 + rng() * 52) / 2;
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

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function smooth01(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * Repulsive shield field — real velocity change. Active whenever shieldLevel >= 10.
 * Slow, small, grazing rocks curve away; fast / head-on / large rocks mostly ignore it.
 */
export function applyShieldDeflection(
  asteroids: Asteroid[],
  ship: Vec2,
  shieldLevel: number,
  dt: number
) {
  const strength = shieldDeflectStrength(shieldLevel);
  if (strength <= 0) return;

  const fieldR = shieldDeflectRadius(shieldLevel);

  for (const a of asteroids) {
    const dx = a.x - ship.x;
    const dy = a.y - ship.y;
    const d = Math.hypot(dx, dy);
    const reach = fieldR + a.radius;
    if (d >= reach || d < 0.001) continue;

    const nx = dx / d;
    const ny = dy / d;

    const speed = Math.hypot(a.vx, a.vy);
    if (speed < 0.4) continue;

    const toShipX = -nx;
    const toShipY = -ny;
    const headOn = (a.vx * toShipX + a.vy * toShipY) / speed;
    if (headOn > DEFLECT_HEAD_ON_MAX) continue;

    const graze = 1 - smooth01(0, DEFLECT_HEAD_ON_MAX, headOn);
    const slow =
      speed <= DEFLECT_SPEED_SOFT
        ? 1
        : DEFLECT_SPEED_FLOOR +
          (1 - DEFLECT_SPEED_FLOOR) *
            (1 - smooth01(DEFLECT_SPEED_SOFT, ASTEROID_MAX_SPEED, speed));

    const size = 1 / (1 + a.radius / DEFLECT_SIZE_REF);
    const hitDist = SHIP_HIT_RADIUS + a.radius;
    const proximity = smooth01(reach, hitDist, d) ** 0.72;

    const push =
      strength * graze * slow * size * proximity * DEFLECT_ACCEL_MAX * dt;

    a.vx += nx * push;
    a.vy += ny * push;

    const tx = -ny;
    const ty = nx;
    const side = Math.sign(a.vx * tx + a.vy * ty) || 1;
    a.vx += tx * push * DEFLECT_SWERVE * side;
    a.vy += ty * push * DEFLECT_SWERVE * side;

    clampAsteroidSpeed(a);
  }
}

export function stepAsteroids(
  asteroids: Asteroid[],
  bodies: Body[],
  bounds: { width: number; height: number },
  dt: number
) {
  if (!asteroids.length) return;

  const { width: w, height: h } = bounds;
  let steps = 1;
  for (const a of asteroids) {
    steps = Math.max(steps, asteroidSubsteps(a, bodies));
  }
  const subDt = dt / steps;

  for (let s = 0; s < steps; s++) {
    for (const a of asteroids) {
      const g = planetGravityAccel(a, { x: a.vx, y: a.vy }, bodies);
      a.vx += g.x * subDt;
      a.vy += g.y * subDt;
      a.x += a.vx * subDt;
      a.y += a.vy * subDt;
      resolvePlanetCollisions(a, bodies);
    }
    resolveAsteroidCollisions(asteroids);
  }

  for (const a of asteroids) {
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
