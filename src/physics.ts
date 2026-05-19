import { add, dist, len, scale, sub } from "./math";
import type { Body, Vec2 } from "./types";

export const G = 2.85;
/** Ship pull from the singularity (planets unaffected). */
const BLACKHOLE_GRAVITY_MULT = 0.32;
/** Stronger planet wells — wider orbits, more surface arc. */
const PLANET_GRAVITY_MULT = 2.75;
const DRAG = 0.2;
/** Speed reference for high-thrust bend compensation (lower = stronger at fast launch). */
const PLANET_SPEED_REF = 52;
const PLANET_SPEED_PULL_MAX = 22;
/** Outer edge of slingshot / orbit band as multiple of planet radius. */
const PLANET_ORBIT_BAND = 3.6;
const GRAVITY_ASSIST_TANGENT = 0.096;
const GRAVITY_ASSIST_EXIT = 0.054;
const BRAKE_DECEL = 220;
const AUTO_STOP_SPEED = 14;
const AUTO_STOP_TIME = 0.35;

export type SimResult =
  | { type: "stopped"; position: Vec2; velocity: Vec2; trail: Vec2[] }
  | { type: "captured"; trail: Vec2[] }
  | { type: "crashed"; trail: Vec2[] }
  | { type: "escaped"; trail: Vec2[] };

export type StepOutcome =
  | { type: "flying" }
  | { type: "stopped" }
  | { type: "captured" }
  | { type: "crashed" }
  | { type: "escaped" };

/** Plummer-style softening per body — keeps close flybys strong without singularities. */
function softenSq(body: Body): number {
  const k = body.kind === "blackhole" ? 0.28 : 0.1;
  return (body.radius * k) ** 2;
}

function nearestPlanetSurfaceGap(pos: Vec2, bodies: Body[]): number {
  let min = Infinity;
  for (const b of bodies) {
    if (b.kind !== "planet") continue;
    const gap = dist(pos, b) - b.radius;
    if (gap < min) min = gap;
  }
  return min;
}

/** 0–1 how deep the ship is in a planet's orbit / slingshot band. */
function planetOrbitProximity(pos: Vec2, planet: Body): number {
  const r = dist(pos, planet);
  const outer = planet.radius * PLANET_ORBIT_BAND;
  if (r <= planet.radius) return 1;
  if (r >= outer) return 0;
  const t = 1 - (r - planet.radius) / (outer - planet.radius);
  return t * t;
}

/** Extra planet pull when launching fast — keeps bends visible at max engine. */
function planetHighSpeedPullScale(speed: number, orbitProx: number): number {
  if (orbitProx <= 0) return 1;
  const ratio = Math.max(1, speed / PLANET_SPEED_REF);
  const target = Math.min(ratio ** 2.25, PLANET_SPEED_PULL_MAX);
  return 1 + (target - 1) * orbitProx;
}

/** Less drag near planets (especially when fast) so arcs can develop. */
function flightDragFactor(pos: Vec2, vel: Vec2, bodies: Body[], dt: number): number {
  const gap = nearestPlanetSurfaceGap(pos, bodies);
  if (gap >= 180) return Math.exp(-DRAG * dt);

  let mult = 0.32 + 0.68 * (gap / 180);
  if (len(vel) > 130 && gap < 130) mult *= 0.5;
  return Math.exp(-DRAG * mult * dt);
}

export type GravityAtOptions = {
  planetMult?: number;
  includePlanets?: boolean;
  includeBlackhole?: boolean;
  strengthScale?: number;
  /** Ship-only: boost pull during fast flybys. */
  speedCompensationVel?: Vec2 | null;
};

/** Gravitational acceleration at a point (used by ship + asteroids). */
export function gravityAtPoint(
  pos: Vec2,
  bodies: Body[],
  options: GravityAtOptions = {}
): Vec2 {
  const {
    planetMult = 1,
    includePlanets = true,
    includeBlackhole = true,
    strengthScale = 1,
    speedCompensationVel = null,
  } = options;

  let ax = 0;
  let ay = 0;
  for (const b of bodies) {
    if (b.kind === "planet" && !includePlanets) continue;
    if (b.kind === "blackhole" && !includeBlackhole) continue;

    const d = sub(b, pos);
    const r2 = d.x * d.x + d.y * d.y + softenSq(b);
    const r = Math.sqrt(r2);
    let pull =
      b.kind === "planet"
        ? planetMult * PLANET_GRAVITY_MULT
        : b.kind === "blackhole"
          ? BLACKHOLE_GRAVITY_MULT
          : 1;

    if (b.kind === "planet" && speedCompensationVel) {
      const orbitProx = planetOrbitProximity(pos, b);
      pull *= planetHighSpeedPullScale(len(speedCompensationVel), orbitProx);
    }

    const f = (G * b.mass * pull) / r2;
    ax += (f * d.x) / r;
    ay += (f * d.y) / r;
  }

  return { x: ax * strengthScale, y: ay * strengthScale };
}

function gravityAt(
  pos: Vec2,
  vel: Vec2,
  bodies: Body[],
  planetGravityMult: number,
  planetAccelMult = 1
): Vec2 {
  const planet = gravityAtPoint(pos, bodies, {
    planetMult: planetGravityMult,
    includeBlackhole: false,
    speedCompensationVel: vel,
  });
  const blackhole = gravityAtPoint(pos, bodies, { includePlanets: false });
  return add(scale(planet, planetAccelMult), blackhole);
}

function nearestSurfaceGap(pos: Vec2, bodies: Body[]): number {
  let min = Infinity;
  for (const b of bodies) {
    const gap = dist(pos, b) - b.radius;
    if (gap < min) min = gap;
  }
  return min;
}

/** Extra integration slices when moving fast past a gravity well (reduces tunneling / weak bends). */
function flightSubsteps(pos: Vec2, vel: Vec2, bodies: Body[]): number {
  const speed = len(vel);
  if (speed < 45) return 1;

  const gap = nearestPlanetSurfaceGap(pos, bodies);
  const anyPlanet = gap < Infinity;
  if (!anyPlanet || gap > 200) {
    const gapAll = nearestSurfaceGap(pos, bodies);
    if (gapAll > 150) return 1;
    if (gapAll < 35) return Math.min(4, Math.max(2, Math.ceil(speed / 90)));
    return Math.min(2, Math.ceil(speed / 160));
  }

  if (gap < 25) return Math.min(10, Math.max(3, Math.ceil(speed / 40)));
  if (gap < 70) return Math.min(8, Math.max(3, Math.ceil(speed / 55)));
  if (gap < 140) return Math.min(5, Math.max(2, Math.ceil(speed / 75)));
  return Math.min(3, Math.ceil(speed / 120));
}

/** Extra speed when skimming planets (slingshot / gravity assist). */
function applyGravityAssist(
  pos: Vec2,
  vel: Vec2,
  bodies: Body[],
  dt: number,
  accelMult = 1
): Vec2 {
  let { x: vx, y: vy } = vel;
  if (Math.hypot(vx, vy) < 8) return vel;

  for (const b of bodies) {
    if (b.kind !== "planet") continue;

    const d = sub(pos, b);
    const r = Math.hypot(d.x, d.y);
    if (r < 1) continue;

    const gap = r - b.radius;
    const orbitOuter = b.radius * PLANET_ORBIT_BAND;
    if (gap < 0 || r > orbitOuter) continue;

    const bandSpan = orbitOuter - b.radius;
    const proximity = bandSpan > 0 ? 1 - (r - b.radius) / bandSpan : 0;
    const prox2 = proximity * proximity;
    const massScale = Math.sqrt(b.mass / 10000);

    const nx = d.x / r;
    const ny = d.y / r;
    const tx = -ny;
    const ty = nx;

    const radial = vx * nx + vy * ny;
    const tangential = vx * tx + vy * ty;

    if (Math.abs(tangential) > 8) {
      const tSign = tangential > 0 ? 1 : -1;
      const tangBoost =
        tSign * prox2 * massScale * GRAVITY_ASSIST_TANGENT * dt * 60 * accelMult;
      vx += tx * tangBoost;
      vy += ty * tangBoost;
    }

    if (radial > 0) {
      const speed = Math.hypot(vx, vy);
      if (speed > 0.5) {
        const exitBoost = prox2 * massScale * GRAVITY_ASSIST_EXIT * dt * 60 * accelMult;
        vx += (vx / speed) * exitBoost;
        vy += (vy / speed) * exitBoost;
      }
    }
  }

  return { x: vx, y: vy };
}

function hitBody(pos: Vec2, bodies: Body[]): Body | null {
  for (const b of bodies) {
    if (dist(pos, b) <= b.radius * (b.kind === "blackhole" ? 1.15 : 0.92)) {
      return b;
    }
  }
  return null;
}

export function stepPhysics(
  pos: Vec2,
  vel: Vec2,
  bodies: Body[],
  bounds: { w: number; h: number },
  dt: number,
  braking: boolean,
  coastTimer: number,
  planetGravityMult = 1,
  autoStop = true,
  planetAccelMult = 1
): { pos: Vec2; vel: Vec2; coastTimer: number; outcome: StepOutcome } {
  const steps = flightSubsteps(pos, vel, bodies);
  const subDt = dt / steps;

  let p = pos;
  let v = vel;
  let ct = coastTimer;

  for (let i = 0; i < steps; i++) {
    const last = i === steps - 1;
    const accel = gravityAt(p, v, bodies, planetGravityMult, planetAccelMult);
    v = add(v, scale(accel, subDt));
    v = applyGravityAssist(p, v, bodies, subDt, planetAccelMult);

    if (braking) {
      const speed = len(v);
      if (speed > 0.5) {
        const brake = Math.min(speed, BRAKE_DECEL * subDt);
        v = scale(v, (speed - brake) / speed);
      } else {
        v = { x: 0, y: 0 };
      }
    }

    v = scale(v, flightDragFactor(p, v, bodies, subDt));

    p = add(p, scale(v, subDt));
    const hit = hitBody(p, bodies);

    if (hit) {
      if (hit.kind === "blackhole") {
        return { pos: p, vel: v, coastTimer: 0, outcome: { type: "captured" } };
      }
      return { pos: p, vel: v, coastTimer: 0, outcome: { type: "crashed" } };
    }

    const margin = 40;
    if (p.x < -margin || p.x > bounds.w + margin || p.y < -margin || p.y > bounds.h + margin) {
      return { pos: p, vel: v, coastTimer: 0, outcome: { type: "escaped" } };
    }

    if (last && autoStop) {
      const speed = len(v);
      if (speed < AUTO_STOP_SPEED) {
        ct += subDt;
        if (ct >= AUTO_STOP_TIME) {
          return { pos: p, vel: { x: 0, y: 0 }, coastTimer: 0, outcome: { type: "stopped" } };
        }
      } else {
        ct = 0;
      }
    }
  }

  return { pos: p, vel: v, coastTimer: ct, outcome: { type: "flying" } };
}

export const SIM_DT = 1 / 60;
const SIM_MAX_STEPS = 6000;
const TRAIL_MIN_DIST = 5;

function pushTrail(trail: Vec2[], pos: Vec2) {
  const last = trail[trail.length - 1];
  if (!last || dist(last, pos) >= TRAIL_MIN_DIST) trail.push({ ...pos });
}

export function simulateTrajectory(
  start: Vec2,
  velocity: Vec2,
  bodies: Body[],
  bounds: { w: number; h: number },
  planetGravityMult = 1,
  planetAccelMult = 1
): SimResult {
  let pos = { ...start };
  let vel = { ...velocity };
  const trail: Vec2[] = [{ ...pos }];
  let coastTimer = 0;

  for (let i = 0; i < SIM_MAX_STEPS; i++) {
    const step = stepPhysics(
      pos,
      vel,
      bodies,
      bounds,
      SIM_DT,
      false,
      coastTimer,
      planetGravityMult,
      true,
      planetAccelMult
    );
    pos = step.pos;
    vel = step.vel;
    coastTimer = step.coastTimer;

    pushTrail(trail, pos);

    if (step.outcome.type === "captured") return { type: "captured", trail };
    if (step.outcome.type === "crashed") return { type: "crashed", trail };
    if (step.outcome.type === "escaped") return { type: "escaped", trail };
    if (step.outcome.type === "stopped") {
      return { type: "stopped", position: pos, velocity: { x: 0, y: 0 }, trail };
    }
  }

  return { type: "stopped", position: pos, velocity: { x: 0, y: 0 }, trail };
}
