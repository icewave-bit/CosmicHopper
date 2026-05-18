import type { Asteroid, Body, Level, Vec2 } from "./types";

function scaleVec(v: Vec2, sx: number, sy: number): Vec2 {
  return { x: v.x * sx, y: v.y * sy };
}

function scaleBody(b: Body, sx: number, sy: number): Body {
  const rScale = Math.min(sx, sy);
  return {
    ...b,
    x: b.x * sx,
    y: b.y * sy,
    radius: b.radius * rScale,
    mass: b.mass * sx * sy,
  };
}

function scaleAsteroid(a: Asteroid, sx: number, sy: number): Asteroid {
  const rScale = Math.min(sx, sy);
  return {
    ...a,
    x: a.x * sx,
    y: a.y * sy,
    vx: a.vx * sx,
    vy: a.vy * sy,
    radius: a.radius * rScale,
  };
}

/** Map a level from its authored size to the viewport (fills screen, no crop). */
export function fitLevel(base: Level, width: number, height: number): Level {
  if (base.width === width && base.height === height) return base;

  const sx = width / base.width;
  const sy = height / base.height;

  return {
    ...base,
    width,
    height,
    start: scaleVec(base.start, sx, sy),
    bodies: base.bodies.map((b) => scaleBody(b, sx, sy)),
    asteroids: base.asteroids?.map((a) => scaleAsteroid(a, sx, sy)),
  };
}
