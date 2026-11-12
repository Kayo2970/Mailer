// Prop types for the vendored React Bits component in PillNav.jsx (JS variant, so it ships none).
import type { CSSProperties, ElementType, JSX, MouseEvent, ReactNode } from 'react';

export interface PillNavItem {
  label: ReactNode;
  href?: string;
  icon?: ReactNode;
  ariaLabel?: string;
}

export interface PillNavProps {
  logo?: string | ReactNode;
  logoAlt?: string;
  logoHref?: string;
  items?: PillNavItem[];
  activeHref?: string;
  defaultActiveIndex?: number;
  onItemClick?: (item: PillNavItem, index: number, event: MouseEvent<HTMLElement>) => void;
  linkComponent?: ElementType;
  theme?: 'dark' | 'light';
  layout?: 'split' | 'joined';
  size?: 'sm' | 'md' | 'lg';
  surface?: 'glass' | 'solid' | 'none';
  itemStyle?: 'plain' | 'pill';
  hoverEffect?: 'fill' | 'glide';
  indicator?: 'dot' | 'pill' | 'none';
  highlightColor?: string;
  highlightTextColor?: string;
  barColor?: string;
  textColor?: string;
  bounce?: number;
  stretch?: number;
  intro?: boolean;
  collapse?: 'auto' | 'always' | 'never';
  onMenuToggle?: (open: boolean) => void;
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
}

export default function PillNav(props: PillNavProps): JSX.Element;

