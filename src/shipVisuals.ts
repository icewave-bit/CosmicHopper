import { UPGRADE_MAX } from "./upgrades";

function parseHexColor(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  if (h.length !== 6) return { r: 57, g: 255, b: 20 };
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** 0 at lv0, ~1 at max — ease-out so early shield buys are visible. */
export function shieldAuraStrength(shieldLevel: number): number {
  if (shieldLevel <= 0) return 0;
  const t = Math.min(shieldLevel, UPGRADE_MAX) / UPGRADE_MAX;
  return 1 - (1 - t) ** 1.5;
}

/**
 * Soft phosphor areola around the ship; grows more vivid with shield level.
 * Drawn in ship-local space — translate to ship position first or pass x/y.
 */
export function drawShieldAura(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  shieldLevel: number,
  hullColor: string,
  options?: { time?: number; hitFlash?: number }
) {
  const vigor = shieldAuraStrength(shieldLevel);
  if (vigor <= 0) return;

  const time = options?.time ?? Date.now();
  const hit = options?.hitFlash ?? 0;
  const hitBoost = hit > 0 ? Math.min(1, hit * 1.2) * 0.35 : 0;
  const strength = Math.min(1, vigor + hitBoost);
  const breathe = 1 + 0.035 * Math.sin(time * 0.003) + hitBoost * 0.08;
  const { r, g, b } = parseHexColor(hullColor);

  ctx.save();
  ctx.translate(x, y);

  const outerR = (12 + strength * 20) * breathe;
  const midR = (8 + strength * 12) * breathe;

  const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, outerR);
  halo.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${0.02 + strength * 0.16})`);
  halo.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${0.01 + strength * 0.08})`);
  halo.addColorStop(1, "transparent");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, outerR, 0, Math.PI * 2);
  ctx.fill();

  const ringCount = strength < 0.2 ? 0 : strength < 0.55 ? 1 : 2;
  for (let i = 0; i < ringCount; i++) {
    const rr = midR * (0.72 + i * 0.36);
    const alpha = 0.05 + strength * (0.24 - i * 0.07);
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    ctx.lineWidth = 1;
    if (i > 0) ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, rr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (strength > 0.32) {
    const coreR = (4 + strength * 7) * breathe;
    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR);
    core.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${0.06 + strength * 0.22})`);
    core.addColorStop(1, "transparent");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, 0, coreR, 0, Math.PI * 2);
    ctx.fill();
  }

  if (strength > 0.82) {
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${0.1 + 0.1 * Math.sin(time * 0.005)})`;
    ctx.lineWidth = 1;
    const tickR = outerR * 0.9;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + time * 0.00015;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * tickR, Math.sin(a) * tickR);
      ctx.lineTo(Math.cos(a) * (tickR + 3), Math.sin(a) * (tickR + 3));
      ctx.stroke();
    }
  }

  ctx.restore();
}
