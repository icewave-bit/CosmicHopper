import { spawnAsteroids } from "./asteroids";
import { applyWorldBounds } from "./levelLayout";
import { generateLevel } from "./levelGenerator";
import { LEVEL_DEFS } from "./levels";
import { sectorDisplayName, TUTORIAL_LEVEL_MAX_INDEX } from "./progress";
import { sectorProfileForSectorLevel } from "./sector";
import type { Level } from "./types";

export const HANDCRAFTED_COUNT = LEVEL_DEFS.length;

const CACHE_VERSION = 10;
const cache = new Map<string, Level>();

function cacheKey(
  index: number,
  worldW: number,
  worldH: number,
  sectorLevel: number
): string {
  const aspectQ = Math.round((worldW / worldH) * 1000);
  return `${index}:${aspectQ}:s${sectorLevel}:v${CACHE_VERSION}`;
}

function withAsteroids(level: Level): Level {
  return { ...level, asteroids: spawnAsteroids(level) };
}

export function resolveLevel(
  index: number,
  worldW: number,
  worldH: number,
  sectorLevel: number,
  viewportMinPx = 600
): Level {
  const key = cacheKey(index, worldW, worldH, sectorLevel);
  const cached = cache.get(key);
  if (cached) return cached;

  const profile = sectorProfileForSectorLevel(sectorLevel);
  const displayName = sectorDisplayName(sectorLevel);

  const base =
    index < HANDCRAFTED_COUNT
      ? applyWorldBounds(LEVEL_DEFS[index]!, worldW, worldH)
      : generateLevel({
          seed: index,
          displayName,
          worldW,
          worldH,
          profile,
          sectorLevel,
          viewportMinPx,
        });

  const withA = withAsteroids(base);
  cache.set(key, withA);
  return withA;
}

export function createRandomLevel(
  worldW: number,
  worldH: number,
  sectorLevel: number,
  viewportMinPx = 600
): { index: number; level: Level } {
  const index = 10_000 + Math.floor(Math.random() * 9_000_000);
  const profile = sectorProfileForSectorLevel(sectorLevel);
  const level = withAsteroids(
    generateLevel({
      seed: index,
      displayName: sectorDisplayName(sectorLevel),
      worldW,
      worldH,
      profile,
      sectorLevel,
      viewportMinPx,
    })
  );
  cache.set(cacheKey(index, worldW, worldH, sectorLevel), level);
  return { index, level };
}

/** Procedural fill for tutorial band when fewer than 9 handcrafted maps exist. */
export function usesProceduralTutorial(index: number): boolean {
  return index > HANDCRAFTED_COUNT - 1 && index <= TUTORIAL_LEVEL_MAX_INDEX;
}

export function clearGeneratedCache() {
  cache.clear();
}
