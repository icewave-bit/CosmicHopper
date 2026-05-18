import { dist, sub } from "./math";
import type { Asteroid, Body, Level, Vec2 } from "./types";

export const THRUST_PENALTY = 0.25;
export const SPEED_PENALTY = 0.25;
const COURSE_DEV_MIN = 0.4;
const COURSE_DEV_MAX = 1.15;

const SHIP_HIT_RADIUS = 5;

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

function gravityOnAsteroid(pos: Vec2, bodies: Body[]): Vec2 {
  let ax = 0;
  let ay = 0;
  for (const b of bodies) {
    if (b.kind === "blackhole") continue;
    const d = sub(b, pos);
    const r2 = d.x * d.x + d.y * d.y + 400;
    const r = Math.sqrt(r2);
    const f = (b.mass * 0.00004) / r2;
    ax += (f * d.x) / r;
    ay += (f * d.y) / r;
  }
  return { x: ax, y: ay };
}

export function stepAsteroids(
  asteroids: Asteroid[],
  bodies: Body[],
  bounds: { width: number; height: number },
  dt: number
) {
  const { width: w, height: h } = bounds;
  for (const a of asteroids) {
    const g = gravityOnAsteroid(a, bodies);
    a.vx += g.x * dt;
    a.vy += g.y * dt;

    const speed = Math.hypot(a.vx, a.vy);
    const maxSpeed = 90;
    if (speed > maxSpeed) {
      a.vx = (a.vx / speed) * maxSpeed;
      a.vy = (a.vy / speed) * maxSpeed;
    }

    a.x += a.vx * dt;
    a.y += a.vy * dt;
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

/** Cut current speed by 75% and knock the velocity vector off course. */
export function applyAsteroidImpact(vel: Vec2, rng: () => number = Math.random): Vec2 {
  const speed = Math.hypot(vel.x, vel.y);
  if (speed < 0.5) return vel;

  const newSpeed = speed * SPEED_PENALTY;
  const heading = Math.atan2(vel.y, vel.x);
  const sign = rng() < 0.5 ? -1 : 1;
  const deviation = sign * (COURSE_DEV_MIN + rng() * (COURSE_DEV_MAX - COURSE_DEV_MIN));
  const newHeading = heading + deviation;

  return {
    x: Math.cos(newHeading) * newSpeed,
    y: Math.sin(newHeading) * newSpeed,
  };
}
