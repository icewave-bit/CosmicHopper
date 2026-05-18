import type { Vec2 } from "./types";

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (v: Vec2, s: number): Vec2 => ({ x: v.x * s, y: v.y * s });
export const len = (v: Vec2): number => Math.hypot(v.x, v.y);
export const norm = (v: Vec2): Vec2 => {
  const l = len(v);
  return l > 1e-8 ? scale(v, 1 / l) : { x: 0, y: 0 };
};
export const dist = (a: Vec2, b: Vec2): number => len(sub(a, b));

export const clamp = (n: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, n));

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
