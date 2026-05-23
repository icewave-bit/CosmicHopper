import type { CameraMode } from "./settings";
import type { ShipUpgrades } from "./upgrades";
import { isPaintOwned, SHIP_COLORS, UPGRADE_DEFS } from "./upgrades";
import type { UpgradeId } from "./upgrades";
import type { Vec2 } from "./types";
import { TOUCH_MIN } from "./screenHud";

export type Rect = { x: number; y: number; w: number; h: number };

export type ShopHit =
  | { type: "open" }
  | { type: "close" }
  | { type: "reset" }
  | { type: "gear" }
  | { type: "settingsBack" }
  | { type: "cameraMode"; mode: CameraMode }
  | { type: "buy"; id: UpgradeId }
  | { type: "color"; index: number }
  | { type: "buyPaint" };

export type ShopLayout = {
  open: boolean;
  settingsOpen: boolean;
  modal: Rect;
  openButton: Rect;
  closeButton: Rect;
  resetButton: Rect;
  gearButton: Rect;
  settingsBackButton: Rect | null;
  cameraModeButtons: { mode: CameraMode; bounds: Rect }[];
  upgradeCards: { id: UpgradeId; buy: Rect; bounds: Rect }[];
  colorSwatches: { index: number; bounds: Rect }[];
  paintBuyButton: Rect | null;
};

function contains(r: Rect, p: Vec2): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

export function computeShopLayout(
  viewportW: number,
  viewportH: number,
  shopOpen: boolean,
  settingsOpen: boolean,
  upgrades: ShipUpgrades,
  paintPreview: number | null
): ShopLayout {
  const openW = TOUCH_MIN;
  const openH = TOUCH_MIN;
  const openButton: Rect = {
    x: 16,
    y: viewportH - openH - 16,
    w: openW,
    h: openH,
  };

  const cardH = 78;
  const cardGap = 8;
  const colorBlock = 108;
  const header = 50;
  const modalW = Math.min(580, viewportW - 32);
  const contentH = header + UPGRADE_DEFS.length * (cardH + cardGap) + colorBlock;
  const modalH = Math.min(contentH, viewportH - 40);
  const modal: Rect = {
    x: (viewportW - modalW) / 2,
    y: (viewportH - modalH) / 2,
    w: modalW,
    h: modalH,
  };

  const closeButton: Rect = {
    x: modal.x + modal.w - TOUCH_MIN - 8,
    y: modal.y + 12,
    w: TOUCH_MIN,
    h: TOUCH_MIN,
  };

  const resetButton: Rect = {
    x: modal.x + modal.w - TOUCH_MIN * 2 - 20,
    y: modal.y + 12,
    w: TOUCH_MIN,
    h: TOUCH_MIN,
  };

  const gearButton: Rect = {
    x: modal.x + modal.w - TOUCH_MIN * 3 - 32,
    y: modal.y + 12,
    w: TOUCH_MIN,
    h: TOUCH_MIN,
  };

  const settingsBackButton: Rect | null = settingsOpen
    ? {
        x: modal.x + 12,
        y: modal.y + 12,
        w: TOUCH_MIN + 16,
        h: TOUCH_MIN,
      }
    : null;

  const settingsBlockH = 120;
  const cameraModeButtons: { mode: CameraMode; bounds: Rect }[] = settingsOpen
    ? (["overview", "pan"] as const).map((mode, i) => ({
        mode,
        bounds: {
          x: modal.x + 24,
          y: modal.y + header + 36 + i * (settingsBlockH + 12),
          w: modal.w - 48,
          h: settingsBlockH,
        },
      }))
    : [];

  const cardsTop = modal.y + header;
  const cardW = modal.w - 24;

  const upgradeCards = UPGRADE_DEFS.map((def, i) => {
    const bounds: Rect = {
      x: modal.x + 12,
      y: cardsTop + i * (cardH + cardGap),
      w: cardW,
      h: cardH,
    };
    const buyW = TOUCH_MIN;
    const buyH = TOUCH_MIN;
    const buy: Rect = {
      x: bounds.x + bounds.w - buyW - 10,
      y: bounds.y + (bounds.h - buyH) / 2,
      w: buyW,
      h: buyH,
    };
    return { id: def.id, bounds, buy };
  });

  const colorsTop = cardsTop + UPGRADE_DEFS.length * (cardH + cardGap) + 26;
  const swatch = TOUCH_MIN;
  const swatchGap = 10;
  const rowW = SHIP_COLORS.length * swatch + (SHIP_COLORS.length - 1) * swatchGap;
  const rowX = modal.x + (modal.w - rowW) / 2;

  const colorSwatches = SHIP_COLORS.map((_, i) => ({
    index: i,
    bounds: {
      x: rowX + i * (swatch + swatchGap),
      y: colorsTop,
      w: swatch,
      h: swatch,
    },
  }));

  const colorSectionBottom =
    cardsTop + UPGRADE_DEFS.length * (cardH + cardGap) + colorBlock;
  const paintBuyH = TOUCH_MIN;
  const paintBuyAreaTop = colorsTop + swatch;

  const showPaintBuy =
    paintPreview !== null && !isPaintOwned(upgrades, paintPreview);
  const paintBuyButton: Rect | null = showPaintBuy
    ? {
        x: modal.x + modal.w / 2 - 60,
        y:
          paintBuyAreaTop +
          (colorSectionBottom - paintBuyAreaTop - paintBuyH) / 2,
        w: 120,
        h: paintBuyH,
      }
    : null;

  return {
    open: shopOpen,
    settingsOpen,
    modal,
    openButton,
    closeButton,
    resetButton,
    gearButton,
    settingsBackButton,
    cameraModeButtons,
    upgradeCards,
    colorSwatches,
    paintBuyButton,
  };
}

export function hitTestShop(layout: ShopLayout, p: Vec2, canUseShop: boolean): ShopHit | null {
  if (!canUseShop) return null;

  if (!layout.open) {
    return contains(layout.openButton, p) ? { type: "open" } : null;
  }

  if (contains(layout.closeButton, p)) return { type: "close" };
  if (layout.settingsBackButton && contains(layout.settingsBackButton, p)) {
    return { type: "settingsBack" };
  }
  if (!layout.settingsOpen && contains(layout.gearButton, p)) return { type: "gear" };
  if (contains(layout.resetButton, p)) return { type: "reset" };

  if (layout.settingsOpen) {
    for (const btn of layout.cameraModeButtons) {
      if (contains(btn.bounds, p)) return { type: "cameraMode", mode: btn.mode };
    }
    if (contains(layout.modal, p)) return null;
    return { type: "close" };
  }

  if (layout.paintBuyButton && contains(layout.paintBuyButton, p)) {
    return { type: "buyPaint" };
  }

  for (const card of layout.upgradeCards) {
    if (contains(card.buy, p)) return { type: "buy", id: card.id };
  }

  for (const sw of layout.colorSwatches) {
    if (contains(sw.bounds, p)) return { type: "color", index: sw.index };
  }

  if (contains(layout.modal, p)) return null;

  return { type: "close" };
}
