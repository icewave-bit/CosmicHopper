const STORAGE_KEY = "blackhole-settings-v1";

/** D — fit full map while aiming, follow ship in flight. C — manual pan while aiming. */
export type CameraMode = "overview" | "pan";

export type GameSettings = {
  cameraMode: CameraMode;
};

const DEFAULT: GameSettings = { cameraMode: "overview" };

export function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT };
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    const cameraMode =
      parsed.cameraMode === "pan" || parsed.cameraMode === "overview"
        ? parsed.cameraMode
        : DEFAULT.cameraMode;
    return { cameraMode };
  } catch {
    return { ...DEFAULT };
  }
}

export function saveSettings(settings: GameSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function cameraModeLabel(mode: CameraMode): string {
  return mode === "overview" ? "OVERVIEW + FOLLOW" : "PAN + FOLLOW";
}
