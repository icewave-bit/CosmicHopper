import { spawnAsteroids } from "./asteroids";
import { applyWorldBounds } from "./levelLayout";
import { generateLevel } from "./levelGenerator";
import { LEVEL_DEFS } from "./levels";
import { sectorProfileForLevelIndex } from "./sector";
import type { Level } from "./types";

export const HANDCRAFTED_COUNT = LEVEL_DEFS.length;

const CACHE_VERSION = 8;
const cache = new Map<string, Level>();

function cacheKey(index: number, worldW: number, worldH: number): string {
  const aspectQ = Math.round((worldW / worldH) * 1000);
  return `${index}:${aspectQ}:v${CACHE_VERSION}`;
}

function withAsteroids(level: Level): Level {
  return { ...level, asteroids: spawnAsteroids(level) };
}

export function resolveLevel(index: number, worldW: number, worldH: number, viewportMinPx = 600): Level {
  const key = cacheKey(index, worldW, worldH);
  const cached = cache.get(key);
  if (cached) return cached;

  const profile = sectorProfileForLevelIndex(index);
  const base =
    index < HANDCRAFTED_COUNT
      ? applyWorldBounds(LEVEL_DEFS[index]!, worldW, worldH)
      : generateLevel({
          seed: index,
          displayIndex: index,
          worldW,
          worldH,
          profile,
          viewportMinPx,
        });

  const level = withAsteroids(base);
  cache.set(key, level);
  return level;
}

export function createRandomLevel(
  worldW: number,
  worldH: number,
  viewportMinPx = 600
): { index: number; level: Level } {
  const index = 10_000 + Math.floor(Math.random() * 9_000_000);
  const profile = sectorProfileForLevelIndex(index);
  const level = withAsteroids(
    generateLevel({
      seed: index,
      displayIndex: index,
      worldW,
      worldH,
      profile,
      viewportMinPx,
    })
  );
  cache.set(cacheKey(index, worldW, worldH), level);
  return { index, level };
}

export function clearGeneratedCache() {
  cache.clear();
}
