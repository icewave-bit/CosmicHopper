import type { GamePhase } from "./types";
import type { Vec2 } from "./types";

export const TOUCH_MIN = 44;

export type Rect = { x: number; y: number; w: number; h: number };

export type ScreenHudLayout = {
  brakeButton: Rect | null;
  continueButton: Rect | null;
};

export type ScreenHudHit = { type: "brake" } | { type: "continue" };

function contains(r: Rect, p: Vec2): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

export function computeScreenHudLayout(
  viewportW: number,
  viewportH: number,
  phase: GamePhase
): ScreenHudLayout {
  const pad = 16;
  const brakeButton: Rect | null =
    phase === "flight"
      ? {
          x: viewportW - pad - TOUCH_MIN,
          y: viewportH - pad - TOUCH_MIN,
          w: TOUCH_MIN,
          h: TOUCH_MIN,
        }
      : null;

  const continueButton: Rect | null =
    phase === "won" || phase === "lost"
      ? {
          x: viewportW / 2 - 120,
          y: viewportH - pad - 52,
          w: 240,
          h: 48,
        }
      : null;

  return { brakeButton, continueButton };
}

export function hitTestScreenHud(layout: ScreenHudLayout, p: Vec2): ScreenHudHit | null {
  if (layout.continueButton && contains(layout.continueButton, p)) {
    return { type: "continue" };
  }
  if (layout.brakeButton && contains(layout.brakeButton, p)) {
    return { type: "brake" };
  }
  return null;
}

const COLORS = {
  phosphor: "#39ff14",
  phosphorDim: "rgba(57, 255, 20, 0.35)",
  warn: "#ff6b35",
};

export function drawScreenHud(
  ctx: CanvasRenderingContext2D,
  layout: ScreenHudLayout,
  phase: GamePhase,
  braking: boolean
) {
  const font = '"Press Start 2P", monospace';

  if (layout.brakeButton) {
    const b = layout.brakeButton;
    ctx.fillStyle = braking ? "rgba(255, 107, 53, 0.35)" : "rgba(57, 255, 20, 0.12)";
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = braking ? COLORS.warn : COLORS.phosphor;
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.font = `7px ${font}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = braking ? COLORS.warn : COLORS.phosphorDim;
    ctx.fillText("BRAKE", b.x + b.w / 2, b.y + b.h / 2);
    ctx.textBaseline = "alphabetic";
  }

  if (layout.continueButton) {
    const b = layout.continueButton;
    const pulse = 0.75 + 0.25 * Math.sin(Date.now() * 0.005);
    ctx.fillStyle = `rgba(57, 255, 20, ${0.18 * pulse})`;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = COLORS.phosphor;
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.font = `9px ${font}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = COLORS.phosphor;
    ctx.fillText(phase === "won" ? "CONTINUE" : "RETRY", b.x + b.w / 2, b.y + b.h / 2);
    ctx.textBaseline = "alphabetic";
  }
}
