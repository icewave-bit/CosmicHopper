import { spawnAsteroids } from "./asteroids";
import { generateLevel } from "./levelGenerator";
import { LEVELS } from "./levels";
import type { Level } from "./types";

export const HANDCRAFTED_COUNT = LEVELS.length;

const CACHE_VERSION = 2;
const cache = new Map<number, Level>();

function withAsteroids(level: Level): Level {
  return { ...level, asteroids: spawnAsteroids(level) };
}

export function resolveLevel(index: number): Level {
  const key = index + CACHE_VERSION * 100_000;
  const cached = cache.get(key);
  if (cached) return cached;

  const base =
    index < HANDCRAFTED_COUNT
      ? LEVELS[index]!
      : generateLevel({ seed: index, displayIndex: index });

  const level = withAsteroids(base);
  cache.set(key, level);
  return level;
}

export function createRandomLevel(): { index: number; level: Level } {
  const index = 10_000 + Math.floor(Math.random() * 9_000_000);
  const level = withAsteroids(generateLevel({ seed: index, displayIndex: index }));
  cache.set(index + CACHE_VERSION * 100_000, level);
  return { index, level };
}

export function clearGeneratedCache() {
  cache.clear();
}
