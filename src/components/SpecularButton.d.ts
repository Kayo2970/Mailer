// Prop types for the vendored React Bits component in SpecularButton.jsx (JS variant, so it ships none).
import type { ButtonHTMLAttributes, JSX, ReactNode } from 'react';

export interface SpecularButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  radius?: number;
  tint?: string;
  tintOpacity?: number;
  blur?: number;
  textColor?: string;
  lineColor?: string;
  baseColor?: string;
  intensity?: number;
  idleIntensity?: number;
  shineSize?: number;
  shineFade?: number;
  thickness?: number;
  glow?: number;
  speed?: number;
  followMouse?: boolean;
  proximity?: number;
  autoAnimate?: boolean;
}

export default function SpecularButton(props: SpecularButtonProps): JSX.Element;

