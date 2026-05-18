import {
  applyAsteroidImpact,
  hitAsteroid,
  removeAsteroid,
  stepAsteroids,
  THRUST_PENALTY,
} from "./asteroids";
import { fitLevel } from "./fitLevel";
import { createRandomLevel, resolveLevel } from "./levelCatalog";
import { clamp, len, sub } from "./math";
import { SIM_DT, stepPhysics } from "./physics";
import { simulatePreviewPath } from "./preview";
import { Renderer } from "./renderer";
import type { GameState, Level, PreviewPath, Vec2, ViewportLayout } from "./types";

const POWER_SCALE = 2.5;
const MIN_DRAG = 18;
const MAX_DRAG = 130;

function dragToPower(dragDistance: number): number {
  return clamp(((dragDistance - MIN_DRAG) / (MAX_DRAG - MIN_DRAG)) * 100, 0, 100);
}

function bestKey(levelId: string) {
  return `blackhole-best-${levelId}`;
}

function loadBest(levelId: string): number | null {
  const v = localStorage.getItem(bestKey(levelId));
  return v ? Number(v) : null;
}

function saveBest(levelId: string, jumps: number) {
  const prev = loadBest(levelId);
  if (prev === null || jumps < prev) {
    localStorage.setItem(bestKey(levelId), String(jumps));
    return jumps;
  }
  return prev;
}

export class Game {
  private canvas: HTMLCanvasElement;
  private renderer: Renderer;
  private level!: Level;
  private state: GameState;
  private pointer: Vec2 | null = null;
  private dragging = false;
  private previewPath: PreviewPath = { segments: [] };
  private previewTimer = 0;
  private braking = false;
  private coastTimer = 0;
  private trailFrame = 0;
  private raf = 0;
  private resizeObserver: ResizeObserver;
  private layout: ViewportLayout = { width: 1, height: 1, scale: 1, offsetX: 0, offsetY: 0 };
  private readonly onViewportResize = () => this.resize();

  constructor(private container: HTMLElement) {
    this.canvas = document.createElement("canvas");
    container.appendChild(this.canvas);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer = new Renderer(this.canvas, dpr);
    this.state = this.createInitialState(0);

    this.bindEvents();
    this.updatePreview();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    window.addEventListener("resize", this.onViewportResize);
    window.visualViewport?.addEventListener("resize", this.onViewportResize);
    this.loop();
  }

  private viewportSize() {
    const rect = this.container.getBoundingClientRect();
    return {
      width: Math.max(320, Math.round(rect.width)),
      height: Math.max(240, Math.round(rect.height)),
    };
  }

  private syncLevelToViewport(base: Level) {
    const { width, height } = this.viewportSize();
    this.level = fitLevel(base, width, height);
    this.layout = { width, height, scale: 1, offsetX: 0, offsetY: 0 };
    this.renderer.setLayout(this.layout);
  }

  private remapState(from: Level, to: Level) {
    const sx = to.width / from.width;
    const sy = to.height / from.height;
    if (sx === 1 && sy === 1) return;

    this.state.ship = { x: this.state.ship.x * sx, y: this.state.ship.y * sy };
    this.state.velocity = {
      x: this.state.velocity.x * sx,
      y: this.state.velocity.y * sy,
    };
    this.state.trail = this.state.trail.map((p) => ({
      x: p.x * sx,
      y: p.y * sy,
    }));
  }

  private createInitialState(levelIndex: number): GameState {
    this.syncLevelToViewport(resolveLevel(levelIndex));
    const level = this.level;
    return {
      levelIndex,
      phase: "aim",
      ship: { ...level.start },
      velocity: { x: 0, y: 0 },
      jumps: 0,
      bestJumps: loadBest(level.id),
      aimAngle: 0,
      aimPower: 0,
      trail: [],
      message: "",
      braking: false,
      thrustMultiplier: 1,
      damageFlash: 0,
    };
  }

  private effectivePowerScale(): number {
    return POWER_SCALE * this.state.thrustMultiplier;
  }

  private bindEvents() {
    const toWorld = (e: PointerEvent): Vec2 => {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };

    this.canvas.addEventListener("pointerdown", (e) => {
      if (this.state.phase !== "aim") return;
      this.dragging = true;
      this.pointer = toWorld(e);
      this.updateAim(this.pointer);
      this.canvas.setPointerCapture(e.pointerId);
    });

    this.canvas.addEventListener("pointermove", (e) => {
      this.pointer = toWorld(e);
      if (this.dragging && this.state.phase === "aim") this.updateAim(this.pointer);
    });

    this.canvas.addEventListener("pointerup", (e) => {
      if (!this.dragging) return;
      this.dragging = false;
      this.pointer = toWorld(e);
      if (this.state.phase === "aim") {
        this.updatePreview(true);
        if (this.state.aimPower > 4) this.launch();
      }
      try {
        this.canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
    });

    this.canvas.addEventListener("click", () => {
      if (this.state.phase === "won" || this.state.phase === "lost") this.afterEnd();
    });

    window.addEventListener("keydown", (e) => {
      if (e.code === "KeyR") this.restartLevel();
      if (e.code === "KeyN") this.nextLevel();
      if (e.code === "KeyG") this.generateLevel();

      if (e.code === "Space") {
        e.preventDefault();
        if (this.state.phase === "flight") {
          this.braking = true;
          this.state.braking = true;
        } else if (this.state.phase === "aim" && this.state.aimPower > 2) {
          this.launch();
        } else if (this.state.phase === "won" || this.state.phase === "lost") {
          this.afterEnd();
        }
      }
    });

    window.addEventListener("keyup", (e) => {
      if (e.code === "Space") {
        this.braking = false;
        this.state.braking = false;
      }
    });
  }

  private updateAim(p: Vec2) {
    const dir = sub(p, this.state.ship);
    const dragDistance = len(dir);
    if (dragDistance < 6) return;
    this.state.aimAngle = Math.atan2(dir.y, dir.x);
    this.state.aimPower = dragToPower(dragDistance);
    this.updatePreview();
  }

  private updatePreview(force = false) {
    if (this.state.aimPower < 2) {
      this.previewPath = { segments: [] };
      return;
    }

    const now = performance.now();
    if (!force && now - this.previewTimer < 32) return;
    this.previewTimer = now;

    this.previewPath = simulatePreviewPath(
      this.state.ship,
      this.state.aimAngle,
      this.state.aimPower,
      this.effectivePowerScale(),
      this.level.bodies,
      { w: this.level.width, h: this.level.height }
    );
  }

  private launch() {
    const speed = this.state.aimPower * this.effectivePowerScale();
    this.state.velocity = {
      x: Math.cos(this.state.aimAngle) * speed,
      y: Math.sin(this.state.aimAngle) * speed,
    };
    this.state.jumps += 1;
    this.state.phase = "flight";
    this.state.message = "";
    this.state.trail = [{ ...this.state.ship }];
    this.coastTimer = 0;
    this.trailFrame = 0;
    this.braking = false;
    this.state.braking = false;
    this.previewPath = { segments: [] };
  }

  private tickAsteroids() {
    const asteroids = this.level.asteroids;
    if (!asteroids?.length) return;
    stepAsteroids(asteroids, this.level.bodies, this.level, SIM_DT);
  }

  private checkAsteroidCollision() {
    const asteroids = this.level.asteroids;
    if (!asteroids?.length) return;

    const hit = hitAsteroid(this.state.ship, asteroids);
    if (hit === null) return;

    removeAsteroid(asteroids, hit);

    this.state.thrustMultiplier = THRUST_PENALTY;
    this.state.damageFlash = 1.5;

    if (this.state.phase === "flight") {
      this.state.velocity = applyAsteroidImpact(this.state.velocity);
    }

    if (this.state.phase === "flight" || this.state.phase === "aim") {
      this.state.message =
        this.state.phase === "flight"
          ? "ASTEROID — THRUST & SPEED -75%"
          : "ASTEROID HIT — THRUST -75%";
    }
  }

  private tickDamageFlash() {
    if (this.state.damageFlash <= 0) return;
    this.state.damageFlash -= SIM_DT;
    if (
      this.state.damageFlash <= 0 &&
      this.state.message.startsWith("ASTEROID HIT")
    ) {
      this.state.message = "";
    }
  }

  private tickFlight() {
    const step = stepPhysics(
      this.state.ship,
      this.state.velocity,
      this.level.bodies,
      { w: this.level.width, h: this.level.height },
      SIM_DT,
      this.braking,
      this.coastTimer
    );

    this.state.ship = step.pos;
    this.state.velocity = step.vel;
    this.coastTimer = step.coastTimer;

    this.trailFrame += 1;
    if (this.trailFrame % 2 === 0) {
      this.state.trail.push({ ...step.pos });
      if (this.state.trail.length > 400) this.state.trail.shift();
    }

    this.checkAsteroidCollision();

    if (step.outcome.type === "flying") return;

    this.state.velocity = { x: 0, y: 0 };
    this.braking = false;
    this.state.braking = false;

    if (step.outcome.type === "captured") {
      const best = saveBest(this.level.id, this.state.jumps);
      this.state.bestJumps = best;
      const par = this.state.jumps <= this.level.par;
      this.state.phase = "won";
      this.state.message = par
        ? `SINGULARITY! ${this.state.jumps} JUMPS`
        : `CAPTURED IN ${this.state.jumps}`;
      return;
    }

    if (step.outcome.type === "crashed") {
      this.state.phase = "lost";
      this.state.message = "HULL BREACH";
      return;
    }

    if (step.outcome.type === "escaped") {
      this.state.phase = "lost";
      this.state.message = "LOST IN VOID";
      return;
    }

    this.state.phase = "aim";
    this.state.aimPower = 0;
    this.previewPath = { segments: [] };
  }

  private restartLevel() {
    this.state = this.createInitialState(this.state.levelIndex);
    this.previewPath = { segments: [] };
    this.braking = false;
    this.coastTimer = 0;
    this.updatePreview();
  }

  private nextLevel() {
    this.state = this.createInitialState(this.state.levelIndex + 1);
    this.previewPath = { segments: [] };
    this.updatePreview();
  }

  private generateLevel() {
    const { index } = createRandomLevel();
    this.state = this.createInitialState(index);
    this.previewPath = { segments: [] };
    this.updatePreview();
  }

  private afterEnd() {
    if (this.state.phase === "won") {
      this.nextLevel();
    } else {
      this.restartLevel();
    }
  }

  private remapAsteroids(from: Level, to: Level) {
    const prev = from.asteroids;
    const next = to.asteroids;
    if (!prev?.length || !next?.length) return;

    const sx = to.width / from.width;
    const sy = to.height / from.height;
    for (let i = 0; i < next.length; i++) {
      const live = prev[i];
      if (!live) continue;
      const a = next[i]!;
      a.x = live.x * sx;
      a.y = live.y * sy;
      a.vx = live.vx * sx;
      a.vy = live.vy * sy;
      a.rotation = live.rotation;
    }
  }

  private resize() {
    const { width, height } = this.viewportSize();
    if (width <= 0 || height <= 0) return;
    if (width === this.layout.width && height === this.layout.height) return;

    const base = resolveLevel(this.state.levelIndex);
    const prev = this.level;
    const next = fitLevel(base, width, height);

    if (prev) {
      this.remapAsteroids(prev, next);
      this.remapState(prev, next);
      if (this.state.phase === "aim") this.updatePreview(true);
    }

    this.level = next;
    this.layout = { width, height, scale: 1, offsetX: 0, offsetY: 0 };
    this.renderer.setLayout(this.layout);
  }

  private loop() {
    this.resize();
    this.tickAsteroids();
    this.tickDamageFlash();
    if (this.state.phase === "flight") this.tickFlight();
    else if (this.state.phase === "aim") this.checkAsteroidCollision();
    this.renderer.draw(this.level, this.state, this.pointer, this.previewPath);
    this.raf = requestAnimationFrame(() => this.loop());
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    window.removeEventListener("resize", this.onViewportResize);
    window.visualViewport?.removeEventListener("resize", this.onViewportResize);
    this.canvas.remove();
  }
}
