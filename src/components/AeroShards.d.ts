// Prop types for the vendored React Bits component in AeroShards.jsx (JS variant, so it ships none).
import type { CSSProperties, JSX } from 'react';

export interface AeroShardsProps {
  shardColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  lightMode?: boolean;
  placement?: 'full' | 'left' | 'right' | 'center';
  material?: 'glass' | 'chrome';
  count?: number;
  shardSize?: number;
  spread?: number;
  twist?: number;
  billow?: number;
  speed?: number;
  scale?: number;
  depthOfField?: number;
  glow?: number;
  grain?: number;
  vignette?: number;
  intro?: boolean;
  mouseInteraction?: boolean;
  mouseStrength?: number;
  markers?: 'plus' | 'dots' | 'none';
  pulseOnClick?: boolean;
  holdToGather?: boolean;
  parallax?: number;
  paused?: boolean;
  dpr?: number;
  className?: string;
  style?: CSSProperties;
  onError?: (error: Error) => void;
}

export default function AeroShards(props: AeroShardsProps): JSX.Element;
