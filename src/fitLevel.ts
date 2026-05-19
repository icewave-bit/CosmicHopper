import type { Vec2, ViewportLayout } from "./types";

/** Internal reference height — world coordinates scale from viewport aspect. */
export const REF_H = 600;

const MIN_ASPECT = 0.55;
const MAX_ASPECT = 2.0;

function clampAspect(viewportW: number, viewportH: number): number {
  const raw = viewportW / viewportH;
  return Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, raw));
}

/** World size derived from viewport aspect (uniform physics scale via REF_H). */
export function computeWorldSize(viewportW: number, viewportH: number): { worldW: number; worldH: number } {
  const aspect = clampAspect(viewportW, viewportH);
  return { worldW: REF_H * aspect, worldH: REF_H };
}

/** Full-bleed layout: single uniform scale, no letterbox offsets. */
export function computeViewportLayout(viewportW: number, viewportH: number): ViewportLayout {
  const { worldW, worldH } = computeWorldSize(viewportW, viewportH);
  const scale = viewportW / worldW;
  return {
    width: viewportW,
    height: viewportH,
    worldW,
    worldH,
    scale,
    offsetX: 0,
    offsetY: 0,
  };
}

export function screenToWorld(screen: Vec2, layout: ViewportLayout): Vec2 {
  return {
    x: screen.x / layout.scale,
    y: screen.y / layout.scale,
  };
}

export function worldToScreen(world: Vec2, layout: ViewportLayout): Vec2 {
  return {
    x: world.x * layout.scale,
    y: world.y * layout.scale,
  };
}
