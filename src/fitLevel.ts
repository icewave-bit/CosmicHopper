import type { Vec2, ViewportLayout } from "./types";

/** Letterbox the fixed game world into the browser viewport (uniform scale). */
export function computeViewportLayout(
  viewportW: number,
  viewportH: number,
  worldW: number,
  worldH: number
): ViewportLayout {
  const scale = Math.min(viewportW / worldW, viewportH / worldH);
  return {
    width: viewportW,
    height: viewportH,
    scale,
    offsetX: (viewportW - worldW * scale) / 2,
    offsetY: (viewportH - worldH * scale) / 2,
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
