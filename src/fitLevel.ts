import { worldScaleMultiplier } from "./progress";
import type { Vec2, ViewportLayout } from "./types";

/** Internal reference height — world coordinates scale from viewport aspect. */
export const REF_H = 600;

const MIN_ASPECT = 0.55;
const MAX_ASPECT = 2.0;

function clampAspect(viewportW: number, viewportH: number): number {
  const raw = viewportW / viewportH;
  return Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, raw));
}

/** World size derived from viewport aspect and campaign sector depth. */
export function computeWorldSize(
  viewportW: number,
  viewportH: number,
  sectorLevel: number
): { worldW: number; worldH: number } {
  const aspect = clampAspect(viewportW, viewportH);
  const mult = worldScaleMultiplier(sectorLevel);
  return { worldW: REF_H * aspect * mult, worldH: REF_H * mult };
}

/** Base layout before camera pan/zoom (scale 1, offsets 0). */
export function computeViewportLayout(
  viewportW: number,
  viewportH: number,
  sectorLevel: number
): ViewportLayout {
  const { worldW, worldH } = computeWorldSize(viewportW, viewportH, sectorLevel);
  return {
    width: viewportW,
    height: viewportH,
    worldW,
    worldH,
    scale: viewportW / worldW,
    offsetX: 0,
    offsetY: 0,
  };
}

export function screenToWorld(screen: Vec2, layout: ViewportLayout): Vec2 {
  return {
    x: (screen.x - layout.offsetX) / layout.scale,
    y: (screen.y - layout.offsetY) / layout.scale,
  };
}

export function worldToScreen(world: Vec2, layout: ViewportLayout): Vec2 {
  return {
    x: world.x * layout.scale + layout.offsetX,
    y: world.y * layout.scale + layout.offsetY,
  };
}
