'use client';

import { useSyncExternalStore } from 'react';
import GhostFibers from './GhostFibers';

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
}

/**
 * Full-page animated WebGL2 background using the React Bits <GhostFibers /> scene.
 * Fixed behind the page content, adapts between lightMode and glowing dark mode
 * via prefers-color-scheme, and pauses when prefers-reduced-motion is enabled.
 */
export function GhostFibersBackground() {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const darkMode = useMediaQuery('(prefers-color-scheme: dark)');

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-slate-100 dark:bg-slate-950" aria-hidden="true">
      <GhostFibers
        glowColor="#ff6a1a"
        layers={3}
        twist={0.9}
        threads={160}
        fiberStyle="dots"
        depthOfField={1.8}
        hoverEffect="focus"
        intro={true}
        mouseInteraction={true}
        lineColor="#ffd9a8"
        secondaryColor="#134eff"
        gradient="across"
        volume={1.5}
        spread={1.9}
        scale={0.65}
        perspective={0.83}
        speed={0.7}
        flow={0.75}
        rollSpeed={-0.24}
        focusDepth={0.05}
        particles={2}
        sparkle={1.4}
        brightness={0.8}
        mouseStrength={0.95}
        lightMode={!darkMode}
        paused={reducedMotion}
      />
    </div>
  );
}

