import { drawShieldAura } from "./shipVisuals";
import { cameraModeLabel, type CameraMode } from "./settings";
import { computeShopLayout, type ShopLayout } from "./shopUi";
import type { GameState } from "./types";
import type { ShipUpgrades, UpgradeId } from "./upgrades";
import {
  isPaintOwned,
  PAINT_COST,
  SHIP_COLORS,
  shipColor,
  UPGRADE_MAX,
  upgradePreview,
  UPGRADE_DEFS,
} from "./upgrades";

const COLORS = {
  phosphor: "#39ff14",
  phosphorDim: "rgba(57, 255, 20, 0.35)",
  phosphorFaint: "rgba(57, 255, 20, 0.12)",
  warn: "#ff6b35",
  accent: "#00e5ff",
  credits: "#ffd447",
  bg: "#020208",
};

export function drawShop(
  ctx: CanvasRenderingContext2D,
  viewportW: number,
  viewportH: number,
  state: GameState,
  upgrades: ShipUpgrades,
  shopOpen: boolean,
  settingsOpen: boolean,
  cameraMode: CameraMode,
  paintPreview: number | null
) {
  const canUse = state.phase === "aim" && state.jumps === 0;
  if (!canUse) return;

  const layout = computeShopLayout(
    viewportW,
    viewportH,
    shopOpen,
    settingsOpen,
    upgrades,
    paintPreview
  );

  if (!shopOpen) {
    drawOpenButton(ctx, layout);
    return;
  }

  drawModal(ctx, layout, upgrades, viewportW, viewportH, cameraMode, paintPreview);
}

function drawOpenButton(ctx: CanvasRenderingContext2D, layout: ShopLayout) {
  const b = layout.openButton;
  const font = '"Press Start 2P", monospace';
  const pulse = 0.7 + 0.3 * Math.sin(Date.now() * 0.004);

  ctx.fillStyle = `rgba(57, 255, 20, ${0.12 * pulse})`;
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.strokeStyle = COLORS.phosphor;
  ctx.lineWidth = 2;
  ctx.strokeRect(b.x, b.y, b.w, b.h);

  ctx.font = `7px ${font}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = COLORS.phosphor;
  ctx.fillText("SHOP", b.x + b.w / 2, b.y + b.h / 2);
  ctx.textBaseline = "alphabetic";
}

function drawModal(
  ctx: CanvasRenderingContext2D,
  layout: ShopLayout,
  upgrades: ShipUpgrades,
  viewportW: number,
  viewportH: number,
  cameraMode: CameraMode,
  paintPreview: number | null
) {
  const { modal } = layout;
  const font = '"Press Start 2P", monospace';

  ctx.fillStyle = "rgba(0, 2, 8, 0.86)";
  ctx.fillRect(0, 0, viewportW, viewportH);

  ctx.fillStyle = "rgba(4, 12, 8, 0.96)";
  ctx.fillRect(modal.x, modal.y, modal.w, modal.h);
  ctx.strokeStyle = COLORS.phosphor;
  ctx.lineWidth = 2;
  ctx.strokeRect(modal.x, modal.y, modal.w, modal.h);

  ctx.font = `14px ${font}`;
  ctx.textAlign = "left";
  ctx.fillStyle = COLORS.phosphor;
  ctx.fillText(layout.settingsOpen ? "SETTINGS" : "SHOP", modal.x + 16, modal.y + 30);

  if (!layout.settingsOpen) {
    ctx.font = `10px ${font}`;
    ctx.fillStyle = COLORS.credits;
    ctx.fillText(`CREDITS ${upgrades.credits}`, modal.x + 16, modal.y + 46);
  }

  if (layout.settingsBackButton) {
    const bb = layout.settingsBackButton;
    ctx.fillStyle = "rgba(57, 255, 20, 0.12)";
    ctx.fillRect(bb.x, bb.y, bb.w, bb.h);
    ctx.strokeStyle = COLORS.phosphorDim;
    ctx.lineWidth = 2;
    ctx.strokeRect(bb.x, bb.y, bb.w, bb.h);
    ctx.font = `7px ${font}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = COLORS.phosphor;
    ctx.fillText("BACK", bb.x + bb.w / 2, bb.y + bb.h / 2);
    ctx.textBaseline = "alphabetic";
  }

  if (!layout.settingsOpen) {
    const gb = layout.gearButton;
    ctx.fillStyle = "rgba(0, 229, 255, 0.12)";
    ctx.fillRect(gb.x, gb.y, gb.w, gb.h);
    ctx.strokeStyle = COLORS.accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(gb.x, gb.y, gb.w, gb.h);
    ctx.font = `7px ${font}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = COLORS.accent;
    ctx.fillText("SET", gb.x + gb.w / 2, gb.y + gb.h / 2);
    ctx.textBaseline = "alphabetic";
  }

  if (!layout.settingsOpen) {
    const rb = layout.resetButton;
    ctx.fillStyle = "rgba(255, 80, 80, 0.18)";
    ctx.fillRect(rb.x, rb.y, rb.w, rb.h);
    ctx.strokeStyle = "rgba(255, 100, 100, 0.85)";
    ctx.lineWidth = 2;
    ctx.strokeRect(rb.x, rb.y, rb.w, rb.h);
    ctx.font = `7px ${font}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(255, 120, 120, 0.95)";
    ctx.fillText("RST", rb.x + rb.w / 2, rb.y + rb.h / 2);
    ctx.textBaseline = "alphabetic";
  }

  const cb = layout.closeButton;
  ctx.fillStyle = "rgba(255, 107, 53, 0.2)";
  ctx.fillRect(cb.x, cb.y, cb.w, cb.h);
  ctx.strokeStyle = COLORS.warn;
  ctx.lineWidth = 2;
  ctx.strokeRect(cb.x, cb.y, cb.w, cb.h);
  ctx.font = `7px ${font}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = COLORS.warn;
  ctx.fillText("X", cb.x + cb.w / 2, cb.y + cb.h / 2);
  ctx.textBaseline = "alphabetic";

  if (layout.settingsOpen) {
    ctx.font = `9px ${font}`;
    ctx.textAlign = "left";
    ctx.fillStyle = COLORS.phosphorDim;
    ctx.fillText("CAMERA", modal.x + 24, modal.y + 72);
    for (const btn of layout.cameraModeButtons) {
      drawCameraModeButton(ctx, btn.bounds, btn.mode, cameraMode);
    }
    return;
  }

  for (const card of layout.upgradeCards) {
    drawUpgradeCard(ctx, card.id, card.bounds, card.buy, upgrades);
  }

  const colorsY = layout.colorSwatches[0]?.bounds.y ?? modal.y + 300;
  const swatchH = layout.colorSwatches[0]?.bounds.h ?? 36;
  ctx.textAlign = "center";
  ctx.font = `10px ${font}`;
  ctx.fillStyle = COLORS.phosphorDim;
  ctx.fillText(`HULL PAINT`, modal.x + modal.w / 2, colorsY - 22);

  for (const sw of layout.colorSwatches) {
    drawColorSwatch(ctx, sw.bounds, sw.index, upgrades, paintPreview);
  }

  if (layout.paintBuyButton) {
    drawPaintBuyButton(ctx, layout.paintBuyButton, upgrades);
  }

  const previewX = modal.x + modal.w - 52;
  const previewY = colorsY + swatchH + 18;
  const hull = shipColor(upgrades, paintPreview);
  drawShieldAura(ctx, previewX, previewY, upgrades.shield, hull);
  drawPreviewShip(ctx, previewX, previewY, hull);
}

function drawCameraModeButton(
  ctx: CanvasRenderingContext2D,
  bounds: { x: number; y: number; w: number; h: number },
  mode: CameraMode,
  active: CameraMode
) {
  const font = '"Press Start 2P", monospace';
  const selected = mode === active;

  ctx.fillStyle = selected ? "rgba(57, 255, 20, 0.2)" : "rgba(0, 0, 0, 0.45)";
  ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
  ctx.strokeStyle = selected ? COLORS.phosphor : COLORS.phosphorFaint;
  ctx.lineWidth = selected ? 2 : 1;
  ctx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);

  ctx.font = `8px ${font}`;
  ctx.textAlign = "left";
  ctx.fillStyle = selected ? COLORS.phosphor : COLORS.phosphorDim;
  ctx.fillText(cameraModeLabel(mode), bounds.x + 12, bounds.y + 28);

  ctx.font = `7px ${font}`;
  ctx.fillStyle = COLORS.phosphorDim;
  const hint =
    mode === "overview"
      ? "Full map while aiming · follows ship in flight"
      : "Drag background to pan · follows in flight";
  ctx.fillText(hint, bounds.x + 12, bounds.y + 52);
}

function drawUpgradeCard(
  ctx: CanvasRenderingContext2D,
  id: UpgradeId,
  bounds: { x: number; y: number; w: number; h: number },
  buy: { x: number; y: number; w: number; h: number },
  upgrades: ShipUpgrades
) {
  const font = '"Press Start 2P", monospace';
  const preview = upgradePreview(id, upgrades[id]);
  const afford = upgrades.credits >= preview.cost;

  ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
  ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
  ctx.strokeStyle = COLORS.phosphorFaint;
  ctx.lineWidth = 1;
  ctx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);

  const pad = 10;
  const textX = bounds.x + 52;
  const contentRight = buy.x - 12;
  const barH = 10;
  const barY = bounds.y + bounds.h - barH - pad;
  const lvLabelY = barY - 10;

  drawUpgradeIcon(ctx, id, bounds.x + 26, bounds.y + 26);

  ctx.textAlign = "left";
  ctx.font = `10px ${font}`;
  ctx.fillStyle = COLORS.phosphor;
  ctx.fillText(UPGRADE_DEFS.find((d) => d.id === id)!.name, textX, bounds.y + 16);

  if (preview.bumpLine) {
    ctx.font = `8px ${font}`;
    ctx.fillStyle = COLORS.credits;
    ctx.fillText(preview.bumpLine, textX, bounds.y + 32);
  }

  ctx.font = `8px ${font}`;
  ctx.fillStyle = preview.maxed ? COLORS.credits : COLORS.phosphorDim;
  ctx.fillText(
    preview.maxed ? "MAX LEVEL" : `LV ${preview.level} / ${UPGRADE_MAX}`,
    textX,
    lvLabelY
  );

  drawLevelBar(ctx, textX, barY, contentRight - textX, upgrades[id], UPGRADE_MAX, barH);

  if (!preview.maxed) {
    ctx.fillStyle = afford ? "rgba(57, 255, 20, 0.25)" : "rgba(255, 107, 53, 0.15)";
    ctx.fillRect(buy.x, buy.y, buy.w, buy.h);
    ctx.strokeStyle = afford ? COLORS.phosphor : COLORS.warn;
    ctx.strokeRect(buy.x, buy.y, buy.w, buy.h);
    ctx.font = `8px ${font}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = afford ? COLORS.phosphor : COLORS.warn;
    ctx.fillText(`${preview.cost} CR`, buy.x + buy.w / 2, buy.y + buy.h / 2);
    ctx.textBaseline = "alphabetic";
  } else {
    ctx.font = `8px ${font}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = COLORS.phosphorDim;
    ctx.fillText("MAX", buy.x + buy.w / 2, buy.y + buy.h / 2);
    ctx.textBaseline = "alphabetic";
  }
}

function drawLevelBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  level: number,
  max: number,
  segH = 10
) {
  const segments = max;
  const gap = 2;
  const segW = Math.max(2, (width - gap * (segments - 1)) / segments);

  for (let i = 0; i < segments; i++) {
    const sx = x + i * (segW + gap);
    const owned = i < level;
    const next = i === level && level < max;

    ctx.fillStyle = owned
      ? COLORS.phosphor
      : next
        ? "rgba(255, 212, 71, 0.35)"
        : "rgba(57, 255, 20, 0.08)";
    ctx.fillRect(sx, y, segW, segH);

    ctx.strokeStyle = owned ? COLORS.phosphor : COLORS.phosphorFaint;
    ctx.lineWidth = 1;
    ctx.strokeRect(sx, y, segW, segH);
  }
}

function drawUpgradeIcon(ctx: CanvasRenderingContext2D, id: UpgradeId, x: number, y: number) {
  ctx.save();
  ctx.translate(x, y);
  if (id === "engine") {
    ctx.fillStyle = COLORS.accent;
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(-6, -5);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-6, 5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = COLORS.warn;
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.lineTo(-18, -4);
    ctx.lineTo(-16, 0);
    ctx.lineTo(-18, 4);
    ctx.closePath();
    ctx.fill();
  } else if (id === "shield") {
    ctx.strokeStyle = COLORS.phosphor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = COLORS.accent;
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(0, 229, 255, 0.35)";
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.strokeStyle = COLORS.phosphorDim;
    ctx.lineWidth = 1;
    for (let r = 6; r <= 16; r += 5) {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = COLORS.phosphor;
    ctx.fillRect(-2, -2, 4, 4);
  }
  ctx.restore();
}

function drawColorSwatch(
  ctx: CanvasRenderingContext2D,
  bounds: { x: number; y: number; w: number; h: number },
  index: number,
  upgrades: ShipUpgrades,
  paintPreview: number | null
) {
  const color = SHIP_COLORS[index]!;
  const owned = isPaintOwned(upgrades, index);
  const active = upgrades.paint === index && paintPreview === null;
  const previewing = paintPreview === index;

  ctx.fillStyle = color.hex;
  ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);

  if (!owned) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
    drawLockIcon(
      ctx,
      bounds.x + bounds.w / 2,
      bounds.y + bounds.h / 2,
      Math.min(bounds.w, bounds.h) * 0.42
    );
  }

  ctx.strokeStyle = previewing
    ? COLORS.credits
    : active
      ? "#ffffff"
      : owned
        ? COLORS.phosphorDim
        : "rgba(255, 255, 255, 0.25)";
  ctx.lineWidth = previewing || active ? 3 : 1;
  ctx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);

  if (active) {
    const font = '"Press Start 2P", monospace';
    ctx.font = `8px ${font}`;
    ctx.textAlign = "center";
    ctx.fillStyle = "#000";
    ctx.fillText("✓", bounds.x + bounds.w / 2, bounds.y + bounds.h / 2 + 3);
  }
}

function drawLockIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number
) {
  const bodyW = size * 0.9;
  const bodyH = size * 0.65;
  const shackleR = size * 0.32;
  const top = cy - size * 0.08;

  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
  ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.arc(cx, top - shackleR * 0.35, shackleR, Math.PI, 0);
  ctx.stroke();

  ctx.fillRect(cx - bodyW / 2, top, bodyW, bodyH);
  ctx.strokeRect(cx - bodyW / 2, top, bodyW, bodyH);

  ctx.fillRect(cx - size * 0.12, top + bodyH * 0.38, size * 0.24, size * 0.22);
  ctx.restore();
}

function drawPaintBuyButton(
  ctx: CanvasRenderingContext2D,
  buy: { x: number; y: number; w: number; h: number },
  upgrades: ShipUpgrades
) {
  const font = '"Press Start 2P", monospace';
  const afford = upgrades.credits >= PAINT_COST;

  ctx.fillStyle = afford ? "rgba(57, 255, 20, 0.25)" : "rgba(255, 107, 53, 0.15)";
  ctx.fillRect(buy.x, buy.y, buy.w, buy.h);
  ctx.strokeStyle = afford ? COLORS.phosphor : COLORS.warn;
  ctx.lineWidth = 1;
  ctx.strokeRect(buy.x, buy.y, buy.w, buy.h);
  ctx.font = `8px ${font}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = afford ? COLORS.phosphor : COLORS.warn;
  ctx.fillText(`${PAINT_COST} CR`, buy.x + buy.w / 2, buy.y + buy.h / 2);
  ctx.textBaseline = "alphabetic";
}

function drawPreviewShip(ctx: CanvasRenderingContext2D, x: number, y: number, hull: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = hull;
  ctx.shadowColor = hull;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.moveTo(12, 0);
  ctx.lineTo(-8, -6);
  ctx.lineTo(-4, 0);
  ctx.lineTo(-8, 6);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
}
