import Svg, { Path } from 'react-native-svg';

/** Path de uma estrela de 5 pontas centralizada em [size]; reaproveitável por variantes com estampa. */
export function starPath(size: number): string {
  const points = 5;
  const center = size / 2;
  const outer = size / 2;
  const inner = outer * 0.42;
  const coords: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = (Math.PI / points) * i - Math.PI / 2;
    const x = center + radius * Math.cos(angle);
    const y = center + radius * Math.sin(angle);
    coords.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(3)} ${y.toFixed(3)}`);
  }
  return `${coords.join(' ')} Z`;
}

interface StarShapeProps {
  size: number;
  color: string;
  filled?: boolean;
  strokeWidth?: number;
  /** Rotação em radianos. */
  rotation?: number;
}

/** Estrela de 5 pontas decorativa (estilo "washi tape"): cheia ou só contorno. */
export function StarShape({
  size,
  color,
  filled = true,
  strokeWidth = 3,
  rotation = 0,
}: StarShapeProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ transform: [{ rotate: `${rotation}rad` }] }}
    >
      <Path
        d={starPath(size)}
        fill={filled ? color : 'none'}
        stroke={filled ? undefined : color}
        strokeWidth={filled ? undefined : strokeWidth}
        strokeLinejoin="round"
      />
    </Svg>
  );
}
