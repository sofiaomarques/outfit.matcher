import { useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { colors } from '../theme/colors';

const AMPLITUDE = 7;
const STROKE = 5;
/** Folga pra onda e metade do traço caberem inteiras no SVG, sem corte. */
const INSET = AMPLITUDE + STROKE;
const PERIOD = 64;
const STEP = 4;

/** Contorno retangular com as quatro bordas onduladas, em coordenadas de [w] x [h]. */
export function wavyPath(w: number, h: number): string {
  const left = INSET;
  const top = INSET;
  const right = w - INSET;
  const bottom = h - INSET;
  // A onda some perto dos cantos (suavizada), pra eles fecharem arredondados em vez de em bico.
  const TAPER = 40;
  const wave = (s: number, from: number, to: number) => {
    const edge = Math.min(Math.abs(s - from), Math.abs(to - s)) / TAPER;
    const t = Math.min(1, edge);
    return AMPLITUDE * (t * t * (3 - 2 * t)) * Math.sin((2 * Math.PI * s) / PERIOD);
  };
  const pts: [number, number][] = [];
  for (let x = left; x <= right; x += STEP) pts.push([x, top + wave(x, left, right)]);
  for (let y = top; y <= bottom; y += STEP) pts.push([right + wave(y, top, bottom), y]);
  for (let x = right; x >= left; x -= STEP) pts.push([x, bottom + wave(x, left, right)]);
  for (let y = bottom; y >= top; y -= STEP) pts.push([left + wave(y, top, bottom), y]);
  return `${pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')} Z`;
}

interface WavyFrameProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Papel creme com moldura rosa ondulada (estilo scrapbook) em volta do conteúdo. */
export function WavyFrame({ children, style }: WavyFrameProps) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ w: width, h: height });
  };
  return (
    <View style={style} onLayout={onLayout}>
      {size.w > 0 && (
        <Svg width={size.w} height={size.h} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Path
            d={wavyPath(size.w, size.h)}
            fill={colors.paper}
            stroke={colors.rose}
            strokeWidth={STROKE}
            strokeLinejoin="round"
          />
        </Svg>
      )}
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: INSET + 20 },
});
