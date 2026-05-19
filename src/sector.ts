export type SectorProfile = {
  tier: number;
  /** Spacing / route-length multiplier (1.0 = baseline). */
  range: number;
  /** Planet count bias. */
  density: number;
  /** Extra jumps added to par. */
  parBias: number;
  label: string;
};

const TIERS: Omit<SectorProfile, "tier">[] = [
  { range: 1.0, density: 1.0, parBias: 0, label: "LOCAL" },
  { range: 1.25, density: 1.15, parBias: 1, label: "WIDE" },
  { range: 1.6, density: 1.3, parBias: 2, label: "DEEP" },
];

const TIER_BOUNDARIES = [0, 10, 20];

/** Below this min viewport edge (px), cap range so bodies stay readable on phones. */
const PLAYABILITY_MIN_VIEWPORT = 380;

export function sectorProfileForLevelIndex(index: number): SectorProfile {
  let tier = 0;
  for (let i = TIER_BOUNDARIES.length - 1; i >= 0; i--) {
    if (index >= TIER_BOUNDARIES[i]!) {
      tier = Math.min(i, TIERS.length - 1);
      break;
    }
  }
  const base = TIERS[tier]!;
  return { tier, ...base };
}

/**
 * Playability floor: on short screens we do not shrink the world (full bleed only),
 * but we cap how much `range` stretches spacing so planets/hole stay legible.
 * Extra late-game difficulty comes from density / parBias instead.
 */
export function effectiveSectorRange(profile: SectorProfile, viewportMinPx: number): number {
  if (viewportMinPx >= PLAYABILITY_MIN_VIEWPORT) return profile.range;
  const t = viewportMinPx / PLAYABILITY_MIN_VIEWPORT;
  return 1 + (profile.range - 1) * t;
}

export function sectorBannerMessage(profile: SectorProfile): string {
  const labels: Record<string, string> = {
    WIDE: "LONG-RANGE SECTOR — Multi-assist routes. Engine & gravity assists matter.",
    DEEP: "DEEP SPACE — Chain assists & engine burns required.",
  };
  return labels[profile.label] ?? `${profile.label} SECTOR`;
}
