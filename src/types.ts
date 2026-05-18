export type Vec2 = { x: number; y: number };

export type ViewportLayout = {
  width: number;
  height: number;
  scale: number;
  offsetX: number;
  offsetY: number;
};

export type Body = {
  id: string;
  x: number;
  y: number;
  radius: number;
  mass: number;
  kind: "planet" | "blackhole";
  color: string;
};

export type Asteroid = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  rotation: number;
  spin: number;
};

export type Level = {
  id: string;
  name: string;
  width: number;
  height: number;
  start: Vec2;
  bodies: Body[];
  asteroids?: Asteroid[];
  par: number;
  seed?: number;
  generated?: boolean;
};

export type GamePhase =
  | "aim"
  | "flight"
  | "won"
  | "lost"
  | "menu";

export type PreviewSegment = {
  points: Vec2[];
  outcome: "captured" | "crashed" | "escaped" | "timeout";
};

export type PreviewPath = {
  segments: PreviewSegment[];
};

export type GameState = {
  levelIndex: number;
  phase: GamePhase;
  ship: Vec2;
  velocity: Vec2;
  jumps: number;
  bestJumps: number | null;
  aimAngle: number;
  aimPower: number;
  trail: Vec2[];
  message: string;
  braking: boolean;
  thrustMultiplier: number;
  damageFlash: number;
};
