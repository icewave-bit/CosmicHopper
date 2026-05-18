import { clamp, dist, len } from "./math";
import type { Asteroid, Body, GameState, Level, PreviewPath, Vec2, ViewportLayout } from "./types";

const COLORS = {
  bg: "#020208",
  grid: "rgba(0, 255, 120, 0.04)",
  phosphor: "#39ff14",
  phosphorDim: "rgba(57, 255, 20, 0.35)",
  phosphorFaint: "rgba(57, 255, 20, 0.12)",
  warn: "#ff6b35",
  accent: "#00e5ff",
};

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private stars: Vec2[] = [];
  private scanPhase = 0;
  private layout: ViewportLayout = { width: 1, height: 1, scale: 1, offsetX: 0, offsetY: 0 };

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

  draw(level: Level, state: GameState, pointer: Vec2 | null, preview: PreviewPath = { segments: [] }) {
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
    this.drawStars(w, h);
    this.drawTrail(state.trail);
    this.drawBodies(level.bodies);
    if (level.asteroids?.length) this.drawAsteroids(level.asteroids);
    this.drawShip(state.ship, state.phase, state.velocity, state.damageFlash > 0);

    if (state.phase === "aim" && state.aimPower > 1) {
      this.drawPreview(preview);
      this.drawAim(state.ship, state.aimAngle, state.aimPower, pointer);
      this.drawPowerBar(level, state.aimPower, state.thrustMultiplier);
    }

    if (state.phase === "flight") {
      this.drawBrakeIndicator(state);
    }

    this.drawHud(level, state);
    this.drawScanlines(w, h);
    this.drawVignette(w, h);
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

  private drawStars(w: number, h: number) {
    const { ctx } = this;
    for (const s of this.stars) {
      const x = s.x * w;
      const y = s.y * h;
      const twinkle = 0.3 + 0.7 * Math.sin(Date.now() * 0.002 + s.x * 40);
      ctx.fillStyle = `rgba(57, 255, 20, ${0.15 * twinkle})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  private drawTrail(trail: Vec2[]) {
    if (trail.length < 2) return;
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(trail[0].x, trail[0].y);
    for (let i = 1; i < trail.length; i++) ctx.lineTo(trail[i].x, trail[i].y);
    ctx.strokeStyle = COLORS.phosphorDim;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private drawBodies(bodies: Body[]) {
    const { ctx } = this;
    for (const b of bodies) {
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

      if (b.kind === "planet") {
        ctx.fillStyle = COLORS.phosphorFaint;
        ctx.beginPath();
        ctx.arc(b.x - b.radius * 0.25, b.y - b.radius * 0.2, b.radius * 0.15, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawAsteroids(asteroids: Asteroid[]) {
    const { ctx } = this;
    for (const a of asteroids) {
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(a.rotation);
      ctx.fillStyle = "#6a6a72";
      ctx.strokeStyle = "rgba(255, 107, 53, 0.55)";
      ctx.lineWidth = 1;
      const r = a.radius;
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.lineTo(-r * 0.6, r * 0.7);
      ctx.lineTo(-r * 0.4, -r * 0.8);
      ctx.lineTo(r * 0.5, -r * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawShip(pos: Vec2, phase: string, velocity: Vec2, damaged: boolean) {
    const { ctx } = this;
    const pulse = phase === "flight" ? 0.6 + 0.4 * Math.sin(Date.now() * 0.02) : 1;
    const angle =
      phase === "flight" && len(velocity) > 2
        ? Math.atan2(velocity.y, velocity.x)
        : 0;
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(angle);
    ctx.fillStyle = damaged ? COLORS.warn : COLORS.phosphor;
    ctx.shadowColor = COLORS.phosphor;
    ctx.shadowBlur = 8 * pulse;
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-4, -4);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-4, 4);
    ctx.closePath();
    ctx.fill();
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
    const maxLen = 100;
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

  private drawBrakeIndicator(state: GameState) {
    const { ctx } = this;
    const font = '"Press Start 2P", monospace';
    ctx.font = `8px ${font}`;
    ctx.textAlign = "center";
    ctx.fillStyle = state.braking ? COLORS.warn : COLORS.phosphorDim;
    ctx.fillText(
      state.braking ? "RETRO BURN" : "HOLD SPACE TO STOP",
      state.ship.x,
      state.ship.y - 22
    );
  }

  private drawHud(level: Level, state: GameState) {
    const { ctx } = this;
    const font = '"Press Start 2P", monospace';

    ctx.font = `10px ${font}`;
    ctx.fillStyle = COLORS.phosphor;
    ctx.textAlign = "left";
    ctx.fillText(level.name, 16, 24);

    ctx.textAlign = "right";
    ctx.fillText(`JUMPS ${state.jumps}`, level.width - 16, 24);
    ctx.fillText(`PAR ${level.par}`, level.width - 16, 40);

    if (state.bestJumps !== null) {
      ctx.fillStyle = COLORS.phosphorDim;
      ctx.fillText(`BEST ${state.bestJumps}`, level.width - 16, 56);
    }

    if (state.thrustMultiplier < 1) {
      ctx.fillStyle = COLORS.warn;
      ctx.textAlign = "left";
      ctx.font = `8px ${font}`;
      ctx.fillText("THRUST 25%", 16, 40);
    }

    ctx.textAlign = "center";
    if (state.phase === "aim") {
      ctx.fillStyle = COLORS.phosphorDim;
      ctx.font = `8px ${font}`;
      ctx.fillText("DRAG FROM SHIP · RELEASE TO JUMP", level.width / 2, level.height - 80);
      ctx.fillText("N = NEXT · G = NEW SECTOR · R = RESTART", level.width / 2, level.height - 68);
    }

    if (state.phase === "flight") {
      ctx.fillStyle = COLORS.phosphorDim;
      ctx.font = `8px ${font}`;
      ctx.fillText("HOLD SPACE — BRAKE TO A HALT", level.width / 2, level.height - 12);
    }

    if (state.message) {
      ctx.font = `12px ${font}`;
      ctx.fillStyle =
        state.phase === "won" ? COLORS.phosphor : state.phase === "lost" ? COLORS.warn : COLORS.phosphorDim;
      ctx.fillText(state.message, level.width / 2, level.height / 2 - 20);
      if (state.phase === "won" || state.phase === "lost") {
        ctx.font = `8px ${font}`;
        ctx.fillStyle = COLORS.phosphorDim;
        ctx.fillText("CLICK OR SPACE TO CONTINUE", level.width / 2, level.height / 2 + 8);
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
