import { Easing, interpolate, spring } from "remotion";

export const CLAMP = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

// Curvas com peso: nada de movimento linear
export const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
export const EASE_IN = Easing.bezier(0.64, 0, 0.78, 0);
export const EASE_IN_OUT = Easing.bezier(0.83, 0, 0.17, 1);
export const EASE_BACK = Easing.bezier(0.34, 1.56, 0.64, 1);

// Spring com overshoot para tudo que entra
export const pop = (
  frame: number,
  fps: number,
  start: number,
  config: { damping?: number; stiffness?: number; mass?: number } = {},
) =>
  spring({
    frame: frame - start,
    fps,
    config: { damping: 10, stiffness: 170, mass: 0.7, ...config },
  });

// Shake de câmera que decai após cada impacto
export const shake = (
  frame: number,
  hits: number[],
  amp = 14,
  dur = 8,
): { x: number; y: number; r: number } => {
  let x = 0;
  let y = 0;
  let r = 0;
  for (const h of hits) {
    const t = frame - h;
    if (t < 0 || t >= dur) continue;
    const decay = (1 - t / dur) ** 2;
    x += Math.sin(t * 2.7 + h) * amp * decay;
    y += Math.cos(t * 3.3 + h * 1.7) * amp * decay;
    r += Math.sin(t * 2.1 + h) * amp * 0.06 * decay;
  }
  return { x, y, r };
};

// Micro movimento constante e periódico (fecha o loop em 600 frames)
export const drift = (frame: number, seed: number, amp: number, period = 600) =>
  Math.sin(((frame + seed * 97) / period) * Math.PI * 2 * 3) * amp;

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// Squash & stretch a partir de um spring de impacto (0 → 1)
export const squash = (s: number, amount = 0.22) => {
  const k = 1 - s; // 1 no impacto, oscila em volta de 0
  return { scaleX: 1 + k * amount, scaleY: 1 - k * amount };
};

export const fadeWindow = (
  frame: number,
  start: number,
  end: number,
  fadeIn = 4,
  fadeOut = 4,
) =>
  interpolate(
    frame,
    [start, start + fadeIn, end - fadeOut, end],
    [0, 1, 1, 0],
    CLAMP,
  );
