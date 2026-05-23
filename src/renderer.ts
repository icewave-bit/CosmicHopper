import {
  ARTIFACT_HARVEST_RADIUS,
  ARTIFACT_VISUAL_RADIUS,
  artifactWorldPos,
} from "./artifacts";
import { clamp, dist, len } from "./math";
import type { Asteroid, GameState, Level, PreviewPath, Vec2, ViewportLayout } from "./types";
import { drawHelpOverlay, drawHelpPrompt } from "./helpRenderer";
import { computeScreenHudLayout, drawScreenHud } from "./screenHud";
import { drawShop } from "./shopRenderer";
import type { CameraMode } from "./settings";
import { drawShieldAura } from "./shipVisuals";
import { shipColor, type ShipUpgrades } from "./upgrades";

/** Speed samples for trend (~0.2s window at 60fps). */
const SPEED_SAMPLE_COUNT = 12;
/** Hide indicator when coasting below this (ship effectively stopped). */
const SPEED_MOVING_MIN = 4;

const COLORS = {
  bg: "#020208",
  grid: "rgba(0, 255, 120, 0.04)",
  phosphor: "#39ff14",
  phosphorDim: "rgba(57, 255, 20, 0.35)",
  phosphorFaint: "rgba(57, 255, 20, 0.12)",
  warn: "#ff6b35",
  danger: "#ff3355",
  accent: "#00e5ff",
  credits: "#ffd447",
};

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private stars: Vec2[] = [];
  private scanPhase = 0;
  private speedSamples: number[] = [];
  private lastSpeedTrend: "up" | "down" = "up";
  private layout: ViewportLayout = {
    width: 1,
    height: 1,
    worldW: 800,
    worldH: 600,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  };

  constructor(
    private canvas: HTMLCanvasElement,
    private dpr: number
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No 2D context");
    this.ctx = ctx;
    this.seedStars(120);
  }

  setLayout(layout: ViewportLayout) {
    this.layout = layout;
    this.canvas.width = Math.round(layout.width * this.dpr);
    this.canvas.height = Math.round(layout.height * this.dpr);
  }

  private seedStars(n: number) {
    this.stars = Array.from({ length: n }, () => ({
      x: Math.random(),
      y: Math.random(),
    }));
  }

  draw(
    level: Level,
    state: GameState,
    upgrades: ShipUpgrades,
    shopOpen: boolean,
    settingsOpen: boolean,
    cameraMode: CameraMode,
    helpOpen: boolean,
    pointer: Vec2 | null,
    preview: PreviewPath = { segments: [] },
    paintPreview: number | null = null
  ) {
    const { ctx, dpr, layout } = this;
    const { width: vw, height: vh, scale, offsetX, offsetY } = layout;
    const { width: w, height: h } = level;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, vw, vh);

    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offsetX, dpr * offsetY);

    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);

    this.drawGrid(w, h);
    const hull = shipColor(upgrades, paintPreview);
    const flightVel = state.phase === "flight" ? state.velocity : null;
    this.drawStars(w, h, flightVel);
    this.drawTrail(state.trail, flightVel, hull);
    this.drawBodies(level, state);
    if (level.asteroids?.length) this.drawAsteroids(level.asteroids);
    drawShieldAura(ctx, state.ship.x, state.ship.y, upgrades.shield, hull, {
      hitFlash: state.damageFlash,
    });
    if (flightVel) {
      this.drawVelocityStreaks(state.ship, flightVel, hull);
    }
    this.drawShip(
      state.ship,
      state.phase,
      state.velocity,
      state.damageFlash > 0,
      hull
    );

    if (state.phase === "aim" && state.aimPower > 1) {
      this.drawPreview(preview);
      this.drawAim(state.ship, state.aimAngle, state.aimPower, pointer);
      this.drawPowerBar(level, state.aimPower, state.thrustMultiplier);
    }

    this.drawHud(level, state, upgrades);
    this.drawScanlines(w, h);
    this.drawVignette(w, h);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawShop(ctx, vw, vh, state, upgrades, shopOpen, settingsOpen, cameraMode, paintPreview);
    if (helpOpen) {
      drawHelpOverlay(ctx, vw, vh);
    } else {
      drawHelpPrompt(ctx, vw, vh);
    }
    const hudLayout = computeScreenHudLayout(vw, vh, state.phase);
    drawScreenHud(ctx, hudLayout, state.phase, state.braking);
  }

  private drawGrid(w: number, h: number) {
    const { ctx } = this;
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    const step = 40;
    for (let x = 0; x <= w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  }

  private drawStars(w: number, h: number, velocity: Vec2 | null) {
    const { ctx } = this;
    const speed = velocity ? len(velocity) : 0;
    const streak = speed > 38;
    const streakLen = streak ? Math.min(10, 2 + speed * 0.04) : 0;
    const dx = streak ? (-velocity!.x / speed) * streakLen : 0;
    const dy = streak ? (-velocity!.y / speed) * streakLen : 0;

    for (const s of this.stars) {
      const x = s.x * w;
      const y = s.y * h;
      const twinkle = 0.3 + 0.7 * Math.sin(Date.now() * 0.002 + s.x * 40);
      const alpha = streak ? 0.08 + 0.12 * twinkle : 0.15 * twinkle;

      if (streak) {
        ctx.strokeStyle = `rgba(57, 255, 20, ${alpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + dx * (0.6 + s.y * 0.4), y + dy * (0.6 + s.y * 0.4));
        ctx.stroke();
      } else {
        ctx.fillStyle = `rgba(57, 255, 20, ${alpha})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  /** Recent path direction at the ship — stable when velocity swings after hits. */
  private trailHeadTangent(trail: Vec2[]): { x: number; y: number } | null {
    if (trail.length < 2) return null;
    const head = trail[trail.length - 1]!;
    const lookback = Math.min(8, trail.length - 1);
    let ax = 0;
    let ay = 0;
    for (let i = trail.length - lookback - 1; i < trail.length - 1; i++) {
      const p = trail[i]!;
      ax += head.x - p.x;
      ay += head.y - p.y;
    }
    const len = Math.hypot(ax, ay);
    if (len < 0.8) return null;
    return { x: ax / len, y: ay / len };
  }

  private drawTrail(trail: Vec2[], velocity: Vec2 | null, hullColor: string) {
    if (trail.length < 2) return;
    const { ctx } = this;
    const speed = velocity ? len(velocity) : 0;
    const head = trail[trail.length - 1]!;
    const tail = trail[0]!;
    const pathBack = this.trailHeadTangent(trail);

    const g = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
    g.addColorStop(0, "rgba(57, 255, 20, 0.02)");
    g.addColorStop(0.55, "rgba(57, 255, 20, 0.12)");
    g.addColorStop(1, hullColor + "cc");

    ctx.beginPath();
    ctx.moveTo(trail[0].x, trail[0].y);
    for (let i = 1; i < trail.length; i++) ctx.lineTo(trail[i].x, trail[i].y);

    ctx.strokeStyle = g;
    ctx.lineWidth = 1.2 + clamp(speed / 38, 0, 3.2);
    if (speed < 45) {
      ctx.setLineDash([Math.max(2, 8 - speed * 0.08), 6]);
    } else {
      ctx.setLineDash([]);
    }
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.setLineDash([]);

    if (pathBack && speed > 20) {
      const coreLen = clamp(speed * 0.22, 10, 48);
      ctx.strokeStyle = hullColor + "99";
      ctx.lineWidth = 1.5 + clamp(speed / 80, 0, 1.5);
      ctx.beginPath();
      ctx.moveTo(head.x, head.y);
      ctx.lineTo(head.x - pathBack.x * coreLen, head.y - pathBack.y * coreLen);
      ctx.stroke();
    }
  }

  private drawVelocityStreaks(pos: Vec2, velocity: Vec2, hullColor: string) {
    const speed = len(velocity);
    if (speed < 22) return;

    const { ctx } = this;
    const angle = Math.atan2(velocity.y, velocity.x);
    const backX = -Math.cos(angle);
    const backY = -Math.sin(angle);
    const perpX = -backY;
    const perpY = backX;
    const mainLen = clamp(speed * 0.32, 16, 58);
    const count = Math.min(5, 2 + Math.floor(speed / 32));

    ctx.lineCap = "round";
    for (let i = 0; i < count; i++) {
      const spread = (i - (count - 1) / 2) * (2.5 + speed * 0.02);
      const len = mainLen * (0.55 + (i % 3) * 0.18);
      const alpha = 0.08 + (i / count) * 0.14;
      const ox = perpX * spread;
      const oy = perpY * spread;

      const hullA = Math.round(alpha * 200)
        .toString(16)
        .padStart(2, "0");
      ctx.strokeStyle = i % 2 === 0 ? `rgba(0, 229, 255, ${alpha})` : `${hullColor}${hullA}`;
      ctx.lineWidth = 1 + (i === count - 1 ? 1.2 : 0);
      ctx.beginPath();
      ctx.moveTo(pos.x + ox, pos.y + oy);
      ctx.lineTo(pos.x + ox + backX * len, pos.y + oy + backY * len);
      ctx.stroke();
    }
  }

  private drawBodies(level: Level, state: GameState) {
    const { ctx } = this;
    const collected = new Set(state.collectedArtifactIds);
    const t = Date.now() * 0.004;

    for (const b of level.bodies) {
      if (b.kind === "blackhole") {
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.radius * 2.2);
        g.addColorStop(0, "rgba(120, 80, 255, 0.5)");
        g.addColorStop(0.5, "rgba(60, 20, 120, 0.2)");
        g.addColorStop(1, "transparent");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius * 2.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = COLORS.phosphorFaint;
        ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
          const r = b.radius * (1.4 + i * 0.35);
          ctx.beginPath();
          ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.beginPath();
        ctx.arc(b.x + 3, b.y + 3, b.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = b.kind === "blackhole" ? "#1a0a2e" : b.color;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = COLORS.phosphor;
      ctx.lineWidth = 1;
      ctx.stroke();

      if (b.kind === "planet" && b.artifact) {
        const pos = artifactWorldPos(b);
        if (!pos) continue;

        const done = collected.has(b.id);
        const pulse = 0.85 + 0.15 * Math.sin(t * 2 + b.artifact.angle);

        if (!done) {
          ctx.strokeStyle = `rgba(255, 212, 71, ${0.35 + 0.2 * pulse})`;
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 3]);
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, ARTIFACT_HARVEST_RADIUS, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        const ag = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, ARTIFACT_VISUAL_RADIUS * 2);
        ag.addColorStop(0, done ? "rgba(57, 255, 20, 0.35)" : "rgba(255, 212, 71, 0.9)");
        ag.addColorStop(1, "transparent");
        ctx.fillStyle = ag;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, ARTIFACT_VISUAL_RADIUS * 2 * pulse, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = done ? COLORS.phosphorDim : COLORS.credits;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, ARTIFACT_VISUAL_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = COLORS.phosphor;
        ctx.lineWidth = 1;
        ctx.stroke();

        const font = '"Press Start 2P", monospace';
        ctx.font = `7px ${font}`;
        ctx.textAlign = "center";
        ctx.fillStyle = done ? COLORS.phosphorDim : COLORS.credits;
        ctx.fillText(done ? "—" : `${b.artifact.value}CR`, pos.x, pos.y - 14);
      }
    }
  }

  private drawAsteroids(asteroids: Asteroid[]) {
    const { ctx } = this;
    const palettes = [
      { fill: "#6a6a72", stroke: "rgba(255, 107, 53, 0.6)" },
      { fill: "#5a6878", stroke: "rgba(140, 200, 255, 0.55)" },
      { fill: "#7a6a58", stroke: "rgba(255, 190, 90, 0.55)" },
      { fill: "#62686a", stroke: "rgba(180, 255, 200, 0.45)" },
      { fill: "#706070", stroke: "rgba(255, 120, 200, 0.5)" },
      { fill: "#4a5248", stroke: "rgba(200, 220, 160, 0.5)" },
    ];

    for (const a of asteroids) {
      const pal = palettes[a.tint % palettes.length]!;
      const radii = a.shapeRadii;
      const n = radii.length;
      const phase = a.rotation * 0.35;

      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(a.rotation);

      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const t = (i / n) * Math.PI * 2 + phase;
        const rr = a.radius * radii[i]!;
        const px = Math.cos(t) * rr;
        const py = Math.sin(t) * rr;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();

      ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
      ctx.fill();
      ctx.translate(1.5, 1.5);
      ctx.fillStyle = pal.fill;
      ctx.fill();
      ctx.translate(-1.5, -1.5);

      ctx.strokeStyle = pal.stroke;
      ctx.lineWidth = a.radius > 4.5 ? 1.25 : 1;
      ctx.stroke();

      if (a.radius > 3.8) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
        const craterR = a.radius * (0.12 + (radii[0]! % 0.15));
        ctx.beginPath();
        ctx.arc(a.radius * 0.22, -a.radius * 0.18, craterR, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  private fillShipHull(ctx: CanvasRenderingContext2D) {
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-4, -4);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-4, 4);
    ctx.closePath();
    ctx.fill();
  }

  private drawShip(
    pos: Vec2,
    phase: string,
    velocity: Vec2,
    damaged: boolean,
    hullColor: string
  ) {
    const { ctx } = this;
    const speed = phase === "flight" ? len(velocity) : 0;
    const pulse = phase === "flight" ? 0.6 + 0.4 * Math.sin(Date.now() * 0.02) : 1;
    const angle =
      phase === "flight" && speed > 2 ? Math.atan2(velocity.y, velocity.x) : 0;
    const fill = damaged ? COLORS.warn : hullColor;
    const stretch = 1 + clamp(speed / 120, 0, 0.22);

    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(angle);

    if (speed > 26) {
      const ghosts = Math.min(4, 1 + Math.floor(speed / 38));
      for (let i = ghosts; i >= 1; i--) {
        const t = i / (ghosts + 1);
        const offset = speed * 0.022 * t;
        ctx.save();
        ctx.translate(-offset, 0);
        ctx.globalAlpha = 0.1 * (1 - t * 0.65);
        ctx.fillStyle = fill;
        this.fillShipHull(ctx);
        ctx.restore();
      }
    }

    ctx.scale(stretch, 1);
    ctx.fillStyle = fill;
    ctx.shadowColor = fill;
    ctx.shadowBlur = (8 + clamp(speed * 0.14, 0, 22)) * pulse;
    this.fillShipHull(ctx);
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  private drawPreview(path: PreviewPath) {
    const seg = path.segments[0];
    if (!seg || seg.points.length < 2) return;
    const { ctx } = this;
    const pts = seg.points;
    const captured = seg.outcome === "captured";

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);

    ctx.strokeStyle = captured ? "rgba(167, 139, 250, 0.75)" : "rgba(0, 229, 255, 0.45)";
    ctx.lineWidth = captured ? 2 : 1.5;
    ctx.stroke();

    for (let i = 0; i < pts.length; i += 4) {
      const p = pts[i];
      const t = i / Math.max(pts.length - 1, 1);
      ctx.fillStyle = captured
        ? `rgba(167, 139, 250, ${0.25 + t * 0.5})`
        : `rgba(0, 229, 255, ${0.2 + t * 0.45})`;
      ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
    }
  }

  private drawAim(ship: Vec2, angle: number, power: number, target: Vec2 | null) {
    if (!target || power < 2) return;
    const { ctx } = this;

    const dragDist = dist(ship, target);
    const maxLen = 100 / this.layout.scale;
    const lineEnd =
      dragDist <= maxLen
        ? target
        : {
            x: ship.x + Math.cos(angle) * maxLen,
            y: ship.y + Math.sin(angle) * maxLen,
          };

    ctx.strokeStyle = COLORS.accent;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(ship.x, ship.y);
    ctx.lineTo(lineEnd.x, lineEnd.y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = COLORS.accent;
    ctx.beginPath();
    ctx.arc(lineEnd.x, lineEnd.y, 4, 0, Math.PI * 2);
    ctx.fill();

    const dots = 10;
    const lineLen = dist(ship, lineEnd);
    for (let i = 1; i <= dots; i++) {
      const t = i / dots;
      const px = ship.x + Math.cos(angle) * lineLen * t;
      const py = ship.y + Math.sin(angle) * lineLen * t;
      ctx.fillStyle = `rgba(0, 229, 255, ${0.15 + t * 0.35})`;
      ctx.fillRect(px - 1, py - 1, 2, 2);
    }
  }

  private speedBarColor(speed: number): string {
    if (speed > 110) return COLORS.danger;
    if (speed >= 86) return COLORS.warn;
    if (speed >= 55) return COLORS.accent;
    return COLORS.phosphor;
  }

  private drawSpeedArrow(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    up: boolean,
    color: string
  ) {
    ctx.fillStyle = color;
    ctx.beginPath();
    if (up) {
      ctx.moveTo(cx, cy - 4);
      ctx.lineTo(cx - 4, cy + 3);
      ctx.lineTo(cx + 4, cy + 3);
    } else {
      ctx.moveTo(cx, cy + 4);
      ctx.lineTo(cx - 4, cy - 3);
      ctx.lineTo(cx + 4, cy - 3);
    }
    ctx.closePath();
    ctx.fill();
  }

  private resetSpeedTrend() {
    this.speedSamples = [];
    this.lastSpeedTrend = "up";
  }

  /** Always up or down — compares recent speed to older samples in the buffer. */
  private updateSpeedTrend(speed: number): "up" | "down" {
    this.speedSamples.push(speed);
    if (this.speedSamples.length > SPEED_SAMPLE_COUNT) {
      this.speedSamples.shift();
    }

    const n = this.speedSamples.length;
    if (n < 3) return this.lastSpeedTrend;

    const mid = Math.max(1, Math.floor(n / 2));
    let oldSum = 0;
    let newSum = 0;
    for (let i = 0; i < mid; i++) oldSum += this.speedSamples[i]!;
    for (let i = mid; i < n; i++) newSum += this.speedSamples[i]!;
    const oldAvg = oldSum / mid;
    const newAvg = newSum / (n - mid);

    this.lastSpeedTrend = newAvg >= oldAvg ? "up" : "down";
    return this.lastSpeedTrend;
  }

  private drawSpeedHud(ctx: CanvasRenderingContext2D, x: number, y: number, speed: number) {
    const font = '"Press Start 2P", monospace';
    const rounded = Math.round(speed);
    const color = this.speedBarColor(speed);
    const up = this.updateSpeedTrend(speed) === "up";

    this.drawSpeedArrow(ctx, x + 4, y + 5, up, color);

    ctx.font = `8px ${font}`;
    ctx.textAlign = "left";
    ctx.fillStyle = color;
    ctx.fillText(`${rounded} Km/s`, x + 16, y + 8);
  }

  private drawPowerBar(level: Level, power: number, thrustMultiplier: number) {
    const { ctx } = this;
    const w = 200;
    const h = 12;
    const x = level.width / 2 - w / 2;
    const y = level.height - 52;
    const font = '"Press Start 2P", monospace';
    const damaged = thrustMultiplier < 1;

    ctx.font = `8px ${font}`;
    ctx.fillStyle = damaged ? COLORS.warn : COLORS.phosphorDim;
    ctx.textAlign = "left";
    ctx.fillText(damaged ? "THRUST (DAMAGED)" : "THRUST", x, y - 6);

    ctx.textAlign = "right";
    const maxLabel = damaged ? `${Math.round(power * thrustMultiplier)}%` : `${Math.round(power)}%`;
    ctx.fillText(maxLabel, x + w, y - 6);

    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = COLORS.phosphorDim;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);

    const fill = (clamp(power, 0, 100) / 100) * thrustMultiplier * (w - 2);
    ctx.fillStyle = damaged ? COLORS.warn : power < 35 ? COLORS.accent : power < 70 ? COLORS.phosphor : COLORS.warn;
    ctx.fillRect(x + 1, y + 1, fill, h - 2);

    if (damaged) {
      ctx.strokeStyle = "rgba(255, 107, 53, 0.35)";
      ctx.setLineDash([2, 3]);
      const cap = (w - 2) * 0.25;
      ctx.strokeRect(x + 1 + cap, y + 1, w - 2 - cap, h - 2);
      ctx.setLineDash([]);
    }
  }

  private drawHullBar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    state: GameState
  ) {
    const segW = 14;
    const segH = 8;
    const gap = 4;

    for (let i = 0; i < state.hullMax; i++) {
      const sx = x + i * (segW + gap);
      const intact = i < state.hullHp;
      ctx.fillStyle = intact ? "rgba(57, 255, 20, 0.35)" : "rgba(0, 0, 0, 0.45)";
      ctx.fillRect(sx, y, segW, segH);
      ctx.strokeStyle = intact ? COLORS.phosphor : COLORS.warn;
      ctx.lineWidth = 1;
      ctx.strokeRect(sx, y, segW, segH);
    }
  }

  private drawHud(level: Level, state: GameState, upgrades: ShipUpgrades) {
    const { ctx } = this;
    const font = '"Press Start 2P", monospace';

    ctx.font = `10px ${font}`;
    ctx.fillStyle = COLORS.phosphor;
    ctx.textAlign = "left";
    ctx.fillText(`SECTOR ${String(state.sectorLevel).padStart(2, "0")}`, 16, 24);

    ctx.font = `8px ${font}`;
    ctx.fillStyle = COLORS.credits;
    ctx.fillText(`CREDITS ${upgrades.credits}`, 16, 40);

    ctx.textAlign = "right";
    ctx.fillText(`JUMPS ${state.jumps}`, level.width - 16, 24);
    ctx.fillText(`PAR ${level.par}`, level.width - 16, 40);

    if (state.bestJumps !== null) {
      ctx.fillStyle = COLORS.phosphorDim;
      ctx.fillText(`BEST ${state.bestJumps}`, level.width - 16, 56);
    }

    this.drawHullBar(ctx, 16, 62, state);

    const inFlight = state.phase === "flight";
    const speed = len(state.velocity);
    if (inFlight && speed > SPEED_MOVING_MIN) {
      this.drawSpeedHud(ctx, 16, 74, speed);
    } else if (!inFlight) {
      this.resetSpeedTrend();
    }

    if (state.thrustMultiplier < 1) {
      ctx.fillStyle = COLORS.warn;
      ctx.textAlign = "left";
      ctx.fillText("THRUST DAMAGED", 16, inFlight && speed > SPEED_MOVING_MIN ? 104 : 88);
    }

    if (state.message) {
      ctx.textAlign = "center";
      ctx.font = `12px ${font}`;
      ctx.fillStyle =
        state.phase === "won" ? COLORS.phosphor : state.phase === "lost" ? COLORS.warn : COLORS.phosphorDim;
      ctx.fillText(state.message, level.width / 2, level.height / 2 - 20);
      if (state.phase === "won" || state.phase === "lost") {
        ctx.font = `8px ${font}`;
        ctx.fillStyle = COLORS.phosphorDim;
        ctx.fillText("TAP CONTINUE OR SPACE", level.width / 2, level.height / 2 + 8);
      }
    }
  }

  private drawScanlines(w: number, h: number) {
    const { ctx } = this;
    this.scanPhase += 0.5;
    ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
    for (let y = Math.floor(this.scanPhase % 4); y < h; y += 4) {
      ctx.fillRect(0, y, w, 1);
    }
  }

  private drawVignette(w: number, h: number) {
    const { ctx } = this;
    const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, h * 0.85);
    g.addColorStop(0, "transparent");
    g.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
}
