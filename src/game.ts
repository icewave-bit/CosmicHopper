import { tryHarvestArtifact } from "./artifacts";
import {
  applyAsteroidImpact,
  hitAsteroid,
  removeAsteroid,
  stepAsteroids,
} from "./asteroids";
import { computeViewportLayout, screenToWorld, worldToScreen } from "./fitLevel";
import { createRandomLevel, resolveLevel } from "./levelCatalog";
import { clamp, len, sub } from "./math";
import { SIM_DT, stepPhysics } from "./physics";
import { simulatePreviewPath } from "./preview";
import { Renderer } from "./renderer";
import { computeShopLayout, hitTestShop } from "./shopUi";
import type { GameState, Level, PreviewPath, Vec2, ViewportLayout } from "./types";
import {
  addCredits,
  asteroidDamagedThrustMultiplier,
  engineThrustMult,
  loadUpgrades,
  resetUpgrades,
  saveUpgrades,
  TEST_STARTING_CREDITS,
  stabilizerGravityMult,
  planetAccelMult,
  isPaintOwned,
  tryApplyOwnedPaint,
  tryBuyPaint,
  tryPurchase,
  type ShipUpgrades,
  type UpgradeId,
  UPGRADE_DEFS,
  SHIP_COLORS,
} from "./upgrades";

const POWER_SCALE = 1.95;
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
  private upgrades: ShipUpgrades = (() => {
    const u = loadUpgrades();
    if (u.credits !== TEST_STARTING_CREDITS) {
      const topped = { ...u, credits: TEST_STARTING_CREDITS };
      saveUpgrades(topped);
      return topped;
    }
    return u;
  })();
  private shopOpen = false;
  private paintPreview: number | null = null;
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

  private syncViewportLayout() {
    const { width, height } = this.viewportSize();
    this.layout = computeViewportLayout(width, height, this.level.width, this.level.height);
    this.renderer.setLayout(this.layout);
  }

  private createInitialState(levelIndex: number): GameState {
    this.level = resolveLevel(levelIndex);
    this.syncViewportLayout();
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
      collectedArtifactIds: [],
    };
  }

  private collectedSet(): Set<string> {
    return new Set(this.state.collectedArtifactIds);
  }

  private planetGravityMult(): number {
    return stabilizerGravityMult(this.upgrades.stabilizer);
  }

  private planetCouplingMult(): number {
    return planetAccelMult(this.upgrades.coupling);
  }

  private checkHarvest() {
    const collected = this.collectedSet();
    for (const body of this.level.bodies) {
      const value = tryHarvestArtifact(this.state.ship, body, collected);
      if (value === null) continue;

      this.upgrades = addCredits(this.upgrades, value);
      this.state.collectedArtifactIds.push(body.id);
      collected.add(body.id);
      this.state.message = `+${value} CR`;
    }
  }

  private canUseShop(): boolean {
    return this.state.phase === "aim" && this.state.jumps === 0;
  }

  private resetAllUpgrades() {
    this.upgrades = resetUpgrades();
    this.paintPreview = null;
    this.state.thrustMultiplier = 1;
    this.state.message = "UPGRADES RESET";
    this.updatePreview(true);
  }

  private buyUpgrade(id: UpgradeId) {
    const next = tryPurchase(id, this.upgrades);
    if (!next) {
      this.state.message = "CANNOT BUY";
      return;
    }
    this.upgrades = next;
    const def = UPGRADE_DEFS.find((d) => d.id === id)!;
    this.state.message = `${def.name} → LV ${next[id]}`;
    this.updatePreview(true);
  }

  private closeShop() {
    this.shopOpen = false;
    this.paintPreview = null;
  }

  private selectPaintColor(index: number) {
    if (isPaintOwned(this.upgrades, index)) {
      this.paintPreview = null;
      const next = tryApplyOwnedPaint(index, this.upgrades);
      if (!next || next.paint === this.upgrades.paint) return;
      this.upgrades = next;
      this.state.message = `HULL ${SHIP_COLORS[index]!.label}`;
      this.updatePreview(true);
      return;
    }
    this.paintPreview = index;
    this.state.message = "PREVIEW";
  }

  private buyPreviewPaint() {
    if (this.paintPreview === null) return;
    const index = this.paintPreview;
    const next = tryBuyPaint(index, this.upgrades);
    if (!next) {
      this.state.message = "CANNOT PAINT";
      return;
    }
    this.upgrades = next;
    this.paintPreview = null;
    this.state.message = `HULL ${SHIP_COLORS[index]!.label}`;
    this.updatePreview(true);
  }

  private handleShopPointer(p: Vec2): boolean {
    if (!this.canUseShop()) return false;

    const layout = computeShopLayout(
      this.level.width,
      this.level.height,
      this.shopOpen,
      this.upgrades,
      this.paintPreview
    );
    const hit = hitTestShop(layout, p, true);
    if (!hit) return this.shopOpen;

    if (hit.type === "open") this.shopOpen = true;
    else if (hit.type === "close") this.closeShop();
    else if (hit.type === "reset") this.resetAllUpgrades();
    else if (hit.type === "buy") this.buyUpgrade(hit.id);
    else if (hit.type === "color") this.selectPaintColor(hit.index);
    else if (hit.type === "buyPaint") this.buyPreviewPaint();

    return true;
  }

  private effectivePowerScale(): number {
    return (
      POWER_SCALE * engineThrustMult(this.upgrades.engine) * this.state.thrustMultiplier
    );
  }

  private bindEvents() {
    const toScreen = (e: PointerEvent): Vec2 => {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };

    const toWorld = (e: PointerEvent): Vec2 => screenToWorld(toScreen(e), this.layout);

    this.canvas.addEventListener("pointerdown", (e) => {
      if (this.state.phase !== "aim") return;
      const p = toWorld(e);
      if (this.handleShopPointer(p)) {
        this.pointer = p;
        return;
      }
      this.dragging = true;
      this.pointer = p;
      this.updateAim(toScreen(e));
      this.canvas.setPointerCapture(e.pointerId);
    });

    this.canvas.addEventListener("pointermove", (e) => {
      const screen = toScreen(e);
      this.pointer = toWorld(e);
      if (this.shopOpen && this.canUseShop()) return;
      if (this.dragging && this.state.phase === "aim") this.updateAim(screen);
    });

    this.canvas.addEventListener("pointerup", (e) => {
      this.pointer = toWorld(e);
      if (this.shopOpen && this.canUseShop()) return;
      if (!this.dragging) return;
      this.dragging = false;
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

      if (e.code === "Escape" && this.shopOpen) {
        this.closeShop();
        return;
      }

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

  private updateAim(screenP: Vec2) {
    const worldP = screenToWorld(screenP, this.layout);
    const dir = sub(worldP, this.state.ship);
    const worldLen = len(dir);
    if (worldLen < 1e-6) return;

    const screenShip = worldToScreen(this.state.ship, this.layout);
    const screenDrag = len(sub(screenP, screenShip));
    if (screenDrag < 6) return;

    this.state.aimAngle = Math.atan2(dir.y, dir.x);
    this.state.aimPower = dragToPower(screenDrag);
    this.pointer = worldP;
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
      { w: this.level.width, h: this.level.height },
      this.planetGravityMult(),
      this.planetCouplingMult()
    );
  }

  private launch() {
    this.closeShop();
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

    const keep = asteroidDamagedThrustMultiplier(this.upgrades.engine, this.upgrades.shield);
    this.state.thrustMultiplier = keep;
    this.state.damageFlash = 1.5;
    const lossPct = Math.round((1 - keep) * 100);

    if (this.state.phase === "flight") {
      this.state.velocity = applyAsteroidImpact(this.state.velocity, keep);
    }

    if (this.state.phase === "flight" || this.state.phase === "aim") {
      this.state.message =
        this.state.phase === "flight"
          ? `ASTEROID — THRUST & SPEED -${lossPct}%`
          : `ASTEROID HIT — THRUST -${lossPct}%`;
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
      this.coastTimer,
      this.planetGravityMult(),
      true,
      this.planetCouplingMult()
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
    this.checkHarvest();

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
    this.closeShop();
    this.state = this.createInitialState(this.state.levelIndex);
    this.previewPath = { segments: [] };
    this.braking = false;
    this.coastTimer = 0;
    this.updatePreview();
  }

  private nextLevel() {
    this.closeShop();
    this.state = this.createInitialState(this.state.levelIndex + 1);
    this.previewPath = { segments: [] };
    this.updatePreview();
  }

  private generateLevel() {
    this.closeShop();
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

  private resize() {
    const { width, height } = this.viewportSize();
    if (width <= 0 || height <= 0) return;
    if (width === this.layout.width && height === this.layout.height) return;

    this.layout = computeViewportLayout(width, height, this.level.width, this.level.height);
    this.renderer.setLayout(this.layout);
    if (this.state.phase === "aim") this.updatePreview(true);
  }

  private loop() {
    this.resize();
    this.tickAsteroids();
    this.tickDamageFlash();
    if (this.state.phase === "flight") this.tickFlight();
    else if (this.state.phase === "aim") {
      this.checkAsteroidCollision();
      this.checkHarvest();
    }
    this.renderer.draw(
      this.level,
      this.state,
      this.upgrades,
      this.shopOpen,
      this.pointer,
      this.previewPath,
      this.shopOpen ? this.paintPreview : null
    );
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
