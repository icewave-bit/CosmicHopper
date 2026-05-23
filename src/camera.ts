import { clamp } from "./math";
import type { CameraMode } from "./settings";
import type { GamePhase, Level, Vec2, ViewportLayout } from "./types";

export type CameraFocus = {
  camX: number;
  camY: number;
  scale: number;
};

const FOLLOW_LERP = 0.12;
const FIT_PAD = 1.06;

function fitScale(viewportW: number, viewportH: number, worldW: number, worldH: number): number {
  return Math.min(viewportW / worldW, viewportH / worldH) / FIT_PAD;
}

function centerOfLevel(level: Level): Vec2 {
  return { x: level.width / 2, y: level.height / 2 };
}

function clampCamera(
  camX: number,
  camY: number,
  scale: number,
  viewportW: number,
  viewportH: number,
  worldW: number,
  worldH: number
): Vec2 {
  const halfW = viewportW / scale / 2;
  const halfH = viewportH / scale / 2;
  return {
    x: clamp(camX, halfW, Math.max(halfW, worldW - halfW)),
    y: clamp(camY, halfH, Math.max(halfH, worldH - halfH)),
  };
}

/** Overview (D): entire sector visible while aiming. */
export function overviewAimCamera(
  layout: ViewportLayout,
  level: Level
): CameraFocus {
  const scale = fitScale(layout.width, layout.height, level.width, level.height);
  const c = centerOfLevel(level);
  const { x, y } = clampCamera(c.x, c.y, scale, layout.width, layout.height, level.width, level.height);
  return { camX: x, camY: y, scale };
}

/** Pan (C): retain camera center; scale fits height or width like overview. */
export function panAimCamera(
  layout: ViewportLayout,
  level: Level,
  camX: number,
  camY: number
): CameraFocus {
  const scale = fitScale(layout.width, layout.height, level.width, level.height);
  const { x, y } = clampCamera(camX, camY, scale, layout.width, layout.height, level.width, level.height);
  return { camX: x, camY: y, scale };
}

/** Flight: smooth follow with slight lead along velocity. */
export function flightCamera(
  layout: ViewportLayout,
  level: Level,
  ship: Vec2,
  velocity: Vec2,
  prev: CameraFocus,
  mode: CameraMode
): CameraFocus {
  const scale =
    mode === "overview"
      ? fitScale(layout.width, layout.height, level.width, level.height)
      : prev.scale > 0
        ? prev.scale
        : fitScale(layout.width, layout.height, level.width, level.height);

  const speed = Math.hypot(velocity.x, velocity.y);
  const lead = speed > 8 ? Math.min(80, speed * 0.35) : 0;
  const leadX = speed > 1e-3 ? (velocity.x / speed) * lead : 0;
  const leadY = speed > 1e-3 ? (velocity.y / speed) * lead : 0;

  const targetX = ship.x + leadX;
  const targetY = ship.y + leadY;
  const camX = prev.camX + (targetX - prev.camX) * FOLLOW_LERP;
  const camY = prev.camY + (targetY - prev.camY) * FOLLOW_LERP;
  const { x, y } = clampCamera(camX, camY, scale, layout.width, layout.height, level.width, level.height);
  return { camX: x, camY: y, scale };
}

export function applyCameraToLayout(layout: ViewportLayout, camera: CameraFocus): ViewportLayout {
  const { camX, camY, scale } = camera;
  return {
    ...layout,
    scale,
    offsetX: layout.width / 2 - camX * scale,
    offsetY: layout.height / 2 - camY * scale,
  };
}

export function initAimCamera(
  layout: ViewportLayout,
  level: Level,
  mode: CameraMode,
  prevCam?: Vec2
): CameraFocus {
  if (mode === "pan" && prevCam) {
    return panAimCamera(layout, level, prevCam.x, prevCam.y);
  }
  return overviewAimCamera(layout, level);
}

export function tickCamera(
  layout: ViewportLayout,
  level: Level,
  phase: GamePhase,
  mode: CameraMode,
  ship: Vec2,
  velocity: Vec2,
  prev: CameraFocus,
  aimPanCenter: Vec2 | null
): CameraFocus {
  if (phase === "flight") {
    return flightCamera(layout, level, ship, velocity, prev, mode);
  }
  if (mode === "pan" && aimPanCenter) {
    return panAimCamera(layout, level, aimPanCenter.x, aimPanCenter.y);
  }
  return overviewAimCamera(layout, level);
}
