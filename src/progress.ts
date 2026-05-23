const STORAGE_KEY = "blackhole-progress-v1";

export type GameProgress = {
  /** 1-based campaign depth (levels reached / current sector). */
  sectorLevel: number;
};

const DEFAULT: GameProgress = { sectorLevel: 1 };

export function loadProgress(): GameProgress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT };
    const parsed = JSON.parse(raw) as Partial<GameProgress>;
    const sectorLevel =
      typeof parsed.sectorLevel === "number" && parsed.sectorLevel >= 1
        ? Math.floor(parsed.sectorLevel)
        : DEFAULT.sectorLevel;
    return { sectorLevel };
  } catch {
    return { ...DEFAULT };
  }
}

export function saveProgress(progress: GameProgress) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

/** Indices 0–8: tutorial band (handcrafted when present, else baseline procedural). */
export const TUTORIAL_LEVEL_MAX_INDEX = 8;

/** World size stays at baseline while sectorLevel ≤ 9. */
export function worldScaleMultiplier(sectorLevel: number): number {
  if (sectorLevel < 10) return 1;
  const step = Math.floor((sectorLevel - 10) / 5) + 1;
  return Math.min(2.5, 1.15 ** step);
}

/** 0 = no expansion tier yet; 1+ = post–level-10 steps every 5 sectors. */
export function worldExpansionStep(sectorLevel: number): number {
  if (sectorLevel < 10) return 0;
  return Math.floor((sectorLevel - 10) / 5) + 1;
}

export function worldExpansionBannerMessage(step: number): string {
  if (step <= 1) return "EXPANDED SECTOR — Longer routes, more bodies in play.";
  return `DEEP EXPANSE — Sector scale +${step}. Speed and slingshots required.`;
}

export function sectorDisplayName(sectorLevel: number): string {
  return `SECTOR ${String(sectorLevel).padStart(2, "0")}`;
}
