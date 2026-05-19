import type { ShipUpgrades } from "./upgrades";
import { isPaintOwned, SHIP_COLORS, UPGRADE_DEFS } from "./upgrades";
import type { UpgradeId } from "./upgrades";
import type { Vec2 } from "./types";

export type Rect = { x: number; y: number; w: number; h: number };

export type ShopHit =
  | { type: "open" }
  | { type: "close" }
  | { type: "reset" }
  | { type: "buy"; id: UpgradeId }
  | { type: "color"; index: number }
  | { type: "buyPaint" };

export type ShopLayout = {
  open: boolean;
  modal: Rect;
  openButton: Rect;
  closeButton: Rect;
  resetButton: Rect;
  upgradeCards: { id: UpgradeId; buy: Rect; bounds: Rect }[];
  colorSwatches: { index: number; bounds: Rect }[];
  paintBuyButton: Rect | null;
};

function contains(r: Rect, p: Vec2): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

export function computeShopLayout(
  levelW: number,
  levelH: number,
  shopOpen: boolean,
  upgrades: ShipUpgrades,
  paintPreview: number | null
): ShopLayout {
  const openW = 88;
  const openH = 24;
  const openButton: Rect = {
    x: 16,
    y: levelH - openH - 24,
    w: openW,
    h: openH,
  };

  const cardH = 78;
  const cardGap = 8;
  const colorBlock = 108;
  const header = 50;
  const modalW = Math.min(580, levelW - 32);
  const contentH = header + UPGRADE_DEFS.length * (cardH + cardGap) + colorBlock;
  const modalH = Math.min(contentH, levelH - 40);
  const modal: Rect = {
    x: (levelW - modalW) / 2,
    y: (levelH - modalH) / 2,
    w: modalW,
    h: modalH,
  };

  const closeButton: Rect = {
    x: modal.x + modal.w - 84,
    y: modal.y + 16,
    w: 72,
    h: 24,
  };

  const resetButton: Rect = {
    x: modal.x + modal.w - 168,
    y: modal.y + 16,
    w: 76,
    h: 24,
  };

  const cardsTop = modal.y + header;
  const cardW = modal.w - 24;

  const upgradeCards = UPGRADE_DEFS.map((def, i) => {
    const bounds: Rect = {
      x: modal.x + 12,
      y: cardsTop + i * (cardH + cardGap),
      w: cardW,
      h: cardH,
    };
    const buyPad = 10;
    const buyW = 84;
    const buyH = 32;
    const buy: Rect = {
      x: bounds.x + bounds.w - buyW - buyPad,
      y: bounds.y + (bounds.h - buyH) / 2,
      w: buyW,
      h: buyH,
    };
    return { id: def.id, bounds, buy };
  });

  const colorsTop = cardsTop + UPGRADE_DEFS.length * (cardH + cardGap) + 26;
  const swatch = 36;
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
  const paintBuyH = 30;
  const paintBuyAreaTop = colorsTop + swatch;

  const showPaintBuy =
    paintPreview !== null && !isPaintOwned(upgrades, paintPreview);
  const paintBuyButton: Rect | null = showPaintBuy
    ? {
        x: modal.x + modal.w / 2 - 52,
        y:
          paintBuyAreaTop +
          (colorSectionBottom - paintBuyAreaTop - paintBuyH) / 2,
        w: 104,
        h: paintBuyH,
      }
    : null;

  return {
    open: shopOpen,
    modal,
    openButton,
    closeButton,
    resetButton,
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
  if (contains(layout.resetButton, p)) return { type: "reset" };

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
