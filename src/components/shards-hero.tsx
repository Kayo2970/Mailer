'use client';

import { useState, useSyncExternalStore } from 'react';
import AeroShards from './AeroShards';

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
 * The banner at the top of the app: the React Bits <AeroShards /> scene on a
 * dark band, with the page header laid over it.
 *
 * Purely decorative and only ever part of this app's own pages — it is drawn
 * live with WebGPU, so it cannot be put in an e-mail. Where WebGPU is missing
 * (Firefox, older Safari) the scene reports an error and is removed, leaving
 * the plain dark band. It holds still for people who ask for reduced motion.
 */
export function ShardsHero({ children, height = 260 }: { children: React.ReactNode; height?: number }) {
  const [failed, setFailed] = useState(false);
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  return (
    <div className="relative mb-5 overflow-hidden rounded-2xl bg-slate-950" style={{ width: '100%', height }}>
      {!failed && (
        <AeroShards
          shardColor="#e3a17a"
          accentColor="#f97316"
          placement="full"
          material="chrome"
          markers="none"
          count={400}
          depthOfField={0.75}
          vignette={0.3}
          mouseInteraction
          pulseOnClick
          holdToGather
          shardSize={1.84}
          twist={0.87}
          billow={1.24}
          speed={0.9}
          scale={0.72}
          glow={0.43}
          mouseStrength={0.78}
          parallax={0.88}
          paused={reducedMotion}
          onError={() => setFailed(true)}
        />
      )}
      {/* The scene reacts to the pointer through window listeners, so the header can sit on top of it. */}
      <div className="absolute inset-0 p-5">{children}</div>
    </div>
  );
}
