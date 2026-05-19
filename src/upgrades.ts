export type UpgradeId = "engine" | "shield" | "stabilizer" | "coupling";

export type ShipUpgrades = {
  credits: number;
  engine: number;
  shield: number;
  stabilizer: number;
  coupling: number;
  paint: number;
  ownedPaints: number[];
};

const STORAGE_KEY = "blackhole-ship-upgrades-v6";

export const PAINT_COST = 15;

export const UPGRADE_MAX = 20;
/** Shield deflect field unlocks at this level (levels 10–20 scale strength). */
export const SHIELD_DEFLECT_MIN_LEVEL = 10;
/** Test / dev starting wallet (new game + reset). */
export const TEST_STARTING_CREDITS = 20000;

const MAX_ENGINE_MULT = 0.775;
const MAX_ASTEROID_MITIGATION = 0.95;

const MIN_ENGINE_MULT = 0.255;
/** Lv0 — full stability, minimal planet pull. */
const STABLE_PLANET_MULT = 0.05;
/** Lv20 — cap at old default pull (no SLING upgrades). */
const SLINGSHOT_PLANET_MULT = 0.5;
const MIN_ASTEROID_MITIGATION = 0;
const GYRO_SLINGSHOT_CURVE = 2;
/** Lv0 — weak coupling; planet pull barely accelerates the ship. */
const MIN_PLANET_ACCEL_MULT = 0.2;
/** Lv20 — full gravity acceleration (current behavior). */
const MAX_PLANET_ACCEL_MULT = 1;
const COUPLING_ACCEL_CURVE = 2;

export const SHIP_COLORS = [
  { id: "phosphor", hex: "#39ff14", label: "PHOS" },
  { id: "cyan", hex: "#00e5ff", label: "CYAN" },
  { id: "ember", hex: "#ff6b35", label: "EMBR" },
  { id: "gold", hex: "#ffd447", label: "GOLD" },
  { id: "magenta", hex: "#ff5ef0", label: "MAG" },
  { id: "violet", hex: "#c4a0ff", label: "VIO" },
  { id: "white", hex: "#ffffff", label: "WHT" },
];

export const UPGRADE_DEFS: {
  id: UpgradeId;
  name: string;
  cost: (level: number) => number;
  max: number;
}[] = [
  { id: "engine", name: "ENGINE", cost: engineUpgradeCost, max: UPGRADE_MAX },
  { id: "shield", name: "SHIELD", cost: shieldUpgradeCost, max: UPGRADE_MAX },
  { id: "stabilizer", name: "SLING", cost: slingCouplingUpgradeCost, max: UPGRADE_MAX },
  { id: "coupling", name: "COUPL", cost: slingCouplingUpgradeCost, max: UPGRADE_MAX },
];

export type UpgradeStatPreview = {
  level: number;
  maxed: boolean;
  cost: number;
  bumpLine: string;
};

function lerp(min: number, max: number, level: number): number {
  const t = Math.min(level, UPGRADE_MAX) / UPGRADE_MAX;
  return min + (max - min) * t;
}

/** Fast early gains, diminishing near max — first upgrades feel strongest. */
function lerpEaseOut(min: number, max: number, level: number, power: number): number {
  const t = Math.min(level, UPGRADE_MAX) / UPGRADE_MAX;
  return min + (max - min) * (1 - (1 - t) ** power);
}

function engineUpgradeCost(level: number): number {
  return Math.round((38 + level * 26 + level * level * 2.4) * 1.25);
}

function slingCouplingUpgradeCost(level: number): number {
  return Math.round((22 + level * 16 + level * level * 2.6) * 1.25);
}

function shieldUpgradeCost(level: number): number {
  return Math.round((25 + level * 20) * 1.25);
}

function clampPaint(index: number): number {
  return Math.max(0, Math.min(SHIP_COLORS.length - 1, index));
}

function normalizeOwnedPaints(paint: number, owned?: number[]): number[] {
  const set = new Set<number>([0]);
  if (Array.isArray(owned)) {
    for (const i of owned) {
      if (i >= 0 && i < SHIP_COLORS.length) set.add(i);
    }
  }
  set.add(paint);
  return [...set].sort((a, b) => a - b);
}

export function loadUpgrades(): ShipUpgrades {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultUpgrades();
    const parsed = JSON.parse(raw) as Partial<ShipUpgrades>;
    const paint = clampPaint(parsed.paint ?? 0);
    return {
      credits: Math.max(0, parsed.credits ?? 0),
      engine: Math.max(0, Math.min(UPGRADE_MAX, parsed.engine ?? 0)),
      shield: Math.max(0, Math.min(UPGRADE_MAX, parsed.shield ?? 0)),
      stabilizer: Math.max(0, Math.min(UPGRADE_MAX, parsed.stabilizer ?? 0)),
      coupling: Math.max(0, Math.min(UPGRADE_MAX, parsed.coupling ?? 0)),
      paint,
      ownedPaints: normalizeOwnedPaints(paint, parsed.ownedPaints),
    };
  } catch {
    return defaultUpgrades();
  }
}

export function saveUpgrades(upgrades: ShipUpgrades) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(upgrades));
}

function freshUpgrades(): ShipUpgrades {
  return { credits: 0, engine: 0, shield: 0, stabilizer: 0, coupling: 0, paint: 0, ownedPaints: [0] };
}

function defaultUpgrades(): ShipUpgrades {
  return { ...freshUpgrades(), credits: TEST_STARTING_CREDITS };
}

export function resetUpgrades(): ShipUpgrades {
  const next = { ...freshUpgrades(), credits: TEST_STARTING_CREDITS };
  saveUpgrades(next);
  return next;
}

export function isPaintOwned(upgrades: ShipUpgrades, index: number): boolean {
  return upgrades.ownedPaints.includes(index);
}

export function resolvePaintIndex(upgrades: ShipUpgrades, previewIndex: number | null): number {
  if (previewIndex !== null) return clampPaint(previewIndex);
  return upgrades.paint;
}

export function shipColorFromIndex(index: number): string {
  return SHIP_COLORS[clampPaint(index)]?.hex ?? SHIP_COLORS[0]!.hex;
}

export function shipColor(upgrades: ShipUpgrades, previewIndex: number | null = null): string {
  return shipColorFromIndex(resolvePaintIndex(upgrades, previewIndex));
}

const ENGINE_THRUST_CURVE = 1.8;

export function engineThrustMult(level: number): number {
  return lerpEaseOut(MIN_ENGINE_MULT, MAX_ENGINE_MULT, level, ENGINE_THRUST_CURVE);
}

/** Planet gravity scale from SLING level — low = stable, high = slingshot skill. */
export function stabilizerGravityMult(level: number): number {
  return lerpEaseOut(STABLE_PLANET_MULT, SLINGSHOT_PLANET_MULT, level, GYRO_SLINGSHOT_CURVE);
}

/** How much planet pull accelerates the ship — COUPL level (black hole unaffected). */
export function planetAccelMult(level: number): number {
  return lerpEaseOut(MIN_PLANET_ACCEL_MULT, MAX_PLANET_ACCEL_MULT, level, COUPLING_ACCEL_CURVE);
}

export function asteroidMitigation(shieldLevel: number): number {
  return lerp(MIN_ASTEROID_MITIGATION, MAX_ASTEROID_MITIGATION, shieldLevel);
}

/** 0 below lv10, ~1 at lv20 — repulsive deflect strength. */
export function shieldDeflectStrength(shieldLevel: number): number {
  if (shieldLevel < SHIELD_DEFLECT_MIN_LEVEL) return 0;
  const span = UPGRADE_MAX - SHIELD_DEFLECT_MIN_LEVEL + 1;
  const t = (Math.min(shieldLevel, UPGRADE_MAX) - SHIELD_DEFLECT_MIN_LEVEL + 1) / span;
  return 1 - (1 - t) ** 1.2;
}

/** World-space radius of the deflect field (matches shield aura scale). */
export function shieldDeflectRadius(shieldLevel: number): number {
  if (shieldLevel < SHIELD_DEFLECT_MIN_LEVEL) return 0;
  const s = shieldDeflectStrength(shieldLevel);
  return 18 + s * 24;
}

/** Thrust & speed kept after a hit (0–1). Weak engine = milder penalty; shield stacks on top. */
export function asteroidThrustRetention(engineLevel: number, shieldLevel: number): number {
  const shieldMit = asteroidMitigation(shieldLevel);
  const penaltyWeight = lerpEaseOut(0, 1, engineLevel, ENGINE_THRUST_CURVE);
  const worstKeep = 0.42;
  const bestKeep = 0.62;
  const baseKeep = bestKeep + (worstKeep - bestKeep) * penaltyWeight;
  return baseKeep + (1 - baseKeep) * shieldMit;
}

/**
 * Thrust multiplier after an asteroid hit (0–1).
 * Upgraded engines always retain at least as much absolute thrust as the previous tier.
 */
export function asteroidDamagedThrustMultiplier(
  engineLevel: number,
  shieldLevel: number
): number {
  const engine = engineThrustMult(engineLevel);
  if (engine <= 0) return 1;

  let keep = asteroidThrustRetention(engineLevel, shieldLevel);
  let damagedThrust = engine * keep;

  if (engineLevel > 0) {
    const prevEngine = engineThrustMult(engineLevel - 1);
    const prevDamaged = prevEngine * asteroidThrustRetention(engineLevel - 1, shieldLevel);
    if (damagedThrust < prevDamaged) {
      damagedThrust = prevDamaged;
      keep = Math.min(1, damagedThrust / engine);
    }
  }

  return keep;
}

export function upgradePreview(id: UpgradeId, level: number): UpgradeStatPreview {
  const def = UPGRADE_DEFS.find((d) => d.id === id)!;
  const maxed = level >= def.max;
  const cost = def.cost(level);

  if (id === "engine") {
    const cur = engineThrustMult(level);
    const nxt = engineThrustMult(level + 1);
    return {
      level,
      maxed,
      cost,
      bumpLine: maxed ? "" : `+${((nxt / cur - 1) * 100).toFixed(0)}% thrust`,
    };
  }

  if (id === "shield") {
    if (level >= SHIELD_DEFLECT_MIN_LEVEL - 1 && !maxed) {
      return { level, maxed, cost, bumpLine: "BONUS ABILITY" };
    }
    const cur = asteroidMitigation(level) * 100;
    const nxt = asteroidMitigation(level + 1) * 100;
    return {
      level,
      maxed,
      cost,
      bumpLine: maxed ? "" : `-${(nxt - cur).toFixed(0)}% asteroid damage`,
    };
  }

  if (id === "stabilizer") {
    const cur = stabilizerGravityMult(level);
    const nxt = stabilizerGravityMult(level + 1);
    return {
      level,
      maxed,
      cost,
      bumpLine: maxed ? "" : `+${((nxt / cur - 1) * 100).toFixed(0)}% planet pull`,
    };
  }

  const cur = planetAccelMult(level);
  const nxt = planetAccelMult(level + 1);
  return {
    level,
    maxed,
    cost,
    bumpLine: maxed ? "" : `+${((nxt / cur - 1) * 100).toFixed(0)}% grav accel`,
  };
}

export function tryPurchase(id: UpgradeId, upgrades: ShipUpgrades): ShipUpgrades | null {
  const def = UPGRADE_DEFS.find((d) => d.id === id)!;
  const level = upgrades[id];
  if (level >= def.max) return null;

  const cost = def.cost(level);
  if (upgrades.credits < cost) return null;

  const next = { ...upgrades, credits: upgrades.credits - cost, [id]: level + 1 };
  saveUpgrades(next);
  return next;
}

export function tryApplyOwnedPaint(index: number, upgrades: ShipUpgrades): ShipUpgrades | null {
  const i = clampPaint(index);
  if (!isPaintOwned(upgrades, i)) return null;
  if (i === upgrades.paint) return upgrades;

  const next = { ...upgrades, paint: i };
  saveUpgrades(next);
  return next;
}

export function tryBuyPaint(index: number, upgrades: ShipUpgrades): ShipUpgrades | null {
  const i = clampPaint(index);
  if (isPaintOwned(upgrades, i)) return tryApplyOwnedPaint(i, upgrades);

  if (upgrades.credits < PAINT_COST) return null;

  const ownedPaints = [...upgrades.ownedPaints, i].sort((a, b) => a - b);
  const next = { ...upgrades, credits: upgrades.credits - PAINT_COST, paint: i, ownedPaints };
  saveUpgrades(next);
  return next;
}

export function addCredits(upgrades: ShipUpgrades, amount: number): ShipUpgrades {
  const next = { ...upgrades, credits: upgrades.credits + amount };
  saveUpgrades(next);
  return next;
}
