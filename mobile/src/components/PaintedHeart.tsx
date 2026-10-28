import Svg, { Path } from 'react-native-svg';

const HEART =
  'M12 21.5C5 16 2 12.5 2 8.8 2 5.9 4.2 3.8 6.9 3.8c1.9 0 3.8 1 5.1 3 1.3-2 3.2-3 5.1-3C19.8 3.8 22 5.9 22 8.8c0 3.7-3 7.2-10 12.7z';

interface PaintedHeartProps {
  size: number;
  color: string;
  /** Rotação em radianos. */
  rotation?: number;
}

/** Coração decorativo de pincelada: preenchimento com um traço claro por dentro. */
export function PaintedHeart({ size, color, rotation = 0 }: PaintedHeartProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={{ transform: [{ rotate: `${rotation}rad` }] }}
    >
      <Path fill={color} d={HEART} />
      <Path
        d={HEART}
        fill="none"
        stroke="rgba(255,255,255,0.3)"
        strokeWidth={0.7}
        strokeLinecap="round"
        transform="translate(3.4 3.6) scale(0.72)"
      />
    </Svg>
  );
}
