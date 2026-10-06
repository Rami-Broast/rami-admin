/**
 * Motion tokens — mirrored from the platform Motion & Animation Design System
 * (customer-app/docs/motion-design-system.md), same numbers so the four apps
 * feel like one. Admin motion is restrained: fast, non-blocking.
 */
export const DURATIONS = { instant: 0, fast: 0.12, normal: 0.22, slow: 0.34 } as const;
export const EASINGS = {
  standard: [0.2, 0, 0, 1],
  enter: [0, 0, 0, 1],
  exit: [0.3, 0, 1, 1],
} as const;
/** Framer-motion transition for most UI (respect reduced motion at call sites). */
export const FADE = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 6 },
  transition: { duration: DURATIONS.normal, ease: EASINGS.enter as unknown as number[] },
};
