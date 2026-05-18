import { add, dist, len, scale, sub } from "./math";
import type { Body, Vec2 } from "./types";

export const G = 1.95;
const SOFTENING = 55;
const DRAG = 0.38;
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

function gravityAt(pos: Vec2, bodies: Body[]): Vec2 {
  let ax = 0;
  let ay = 0;
  for (const b of bodies) {
    const d = sub(b, pos);
    const r2 = d.x * d.x + d.y * d.y + SOFTENING;
    const r = Math.sqrt(r2);
    const f = (G * b.mass) / r2;
    ax += (f * d.x) / r;
    ay += (f * d.y) / r;
  }
  return { x: ax, y: ay };
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
  autoStop = true
): { pos: Vec2; vel: Vec2; coastTimer: number; outcome: StepOutcome } {
  const accel = gravityAt(pos, bodies);
  let v = add(vel, scale(accel, dt));

  if (braking) {
    const speed = len(v);
    if (speed > 0.5) {
      const brake = Math.min(speed, BRAKE_DECEL * dt);
      v = scale(v, (speed - brake) / speed);
    } else {
      v = { x: 0, y: 0 };
    }
  }

  const dragFactor = Math.exp(-DRAG * dt);
  v = scale(v, dragFactor);

  const next = add(pos, scale(v, dt));
  const hit = hitBody(next, bodies);

  if (hit) {
    if (hit.kind === "blackhole") return { pos: next, vel: v, coastTimer: 0, outcome: { type: "captured" } };
    return { pos: next, vel: v, coastTimer: 0, outcome: { type: "crashed" } };
  }

  const margin = 40;
  if (
    next.x < -margin ||
    next.x > bounds.w + margin ||
    next.y < -margin ||
    next.y > bounds.h + margin
  ) {
    return { pos: next, vel: v, coastTimer: 0, outcome: { type: "escaped" } };
  }

  const speed = len(v);
  let nextCoast = coastTimer;
  if (autoStop && speed < AUTO_STOP_SPEED) {
    nextCoast += dt;
    if (nextCoast >= AUTO_STOP_TIME) {
      return { pos: next, vel: { x: 0, y: 0 }, coastTimer: 0, outcome: { type: "stopped" } };
    }
  } else {
    nextCoast = 0;
  }

  return { pos: next, vel: v, coastTimer: nextCoast, outcome: { type: "flying" } };
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
  bounds: { w: number; h: number }
): SimResult {
  let pos = { ...start };
  let vel = { ...velocity };
  const trail: Vec2[] = [{ ...pos }];
  let coastTimer = 0;

  for (let i = 0; i < SIM_MAX_STEPS; i++) {
    const step = stepPhysics(pos, vel, bodies, bounds, SIM_DT, false, coastTimer, true);
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

