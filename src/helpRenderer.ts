const COLORS = {
  phosphor: "#39ff14",
  phosphorDim: "rgba(57, 255, 20, 0.35)",
  accent: "#00e5ff",
};

type HelpLine = { text: string; dim?: boolean };

function helpLines(): HelpLine[] {
  return [
    { text: "COLLECT CREDITS · GET TO PORTAL · UPGRADE YOUR SHIP" },
    { text: "DRAG FROM SHIP · RELEASE TO START", dim: true },
    { text: "HOLD SPACE OR BRAKE — THRUST REVERSAL", dim: true },
    { text: "N — NEXT SECTOR", dim: true },
    { text: "G — NEW RANDOM SECTOR", dim: true },
    { text: "R — RESTART SECTOR", dim: true },
  ];
}

export function drawHelpPrompt(
  ctx: CanvasRenderingContext2D,
  viewportW: number,
  viewportH: number
) {
  const font = '"Press Start 2P", monospace';
  ctx.font = `8px ${font}`;
  ctx.textAlign = "center";
  ctx.fillStyle = COLORS.phosphorDim;
  ctx.fillText("PRESS H FOR HELP", viewportW / 2, viewportH - 14);
}

export function drawHelpOverlay(
  ctx: CanvasRenderingContext2D,
  viewportW: number,
  viewportH: number
) {
  const font = '"Press Start 2P", monospace';

  ctx.fillStyle = "rgba(0, 2, 8, 0.88)";
  ctx.fillRect(0, 0, viewportW, viewportH);

  const pad = 20;
  const lineH = 14;
  const lines = helpLines();
  const boxW = Math.min(560, viewportW - 40);
  const boxH = Math.min(48 + lines.length * lineH + 28, viewportH - 40);
  const bx = (viewportW - boxW) / 2;
  const by = (viewportH - boxH) / 2;

  ctx.fillStyle = "rgba(4, 12, 8, 0.98)";
  ctx.fillRect(bx, by, boxW, boxH);
  ctx.strokeStyle = COLORS.phosphor;
  ctx.lineWidth = 2;
  ctx.strokeRect(bx, by, boxW, boxH);

  ctx.textAlign = "left";
  ctx.font = `12px ${font}`;
  ctx.fillStyle = COLORS.phosphor;
  ctx.fillText("HELP", bx + pad, by + 26);

  let y = by + 46;
  ctx.font = `8px ${font}`;
  for (const line of lines) {
    ctx.fillStyle = line.dim ? COLORS.phosphorDim : COLORS.phosphor;
    ctx.fillText(line.text, bx + pad, y);
    y += lineH;
  }

  ctx.textAlign = "center";
  ctx.fillStyle = COLORS.accent;
  ctx.font = `8px ${font}`;
  ctx.fillText("PRESS H CLOSE", viewportW / 2, by + boxH - 14);
}
