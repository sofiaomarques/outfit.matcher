import Svg, { Defs, Pattern, Rect } from 'react-native-svg';

import { colors } from '../theme/colors';

/** Faixa xadrez vermelho e creme, usada como detalhe de acabamento. */
export function CheckerStrip({ height = 14 }: { height?: number }) {
  return (
    <Svg width="100%" height={height}>
      <Defs>
        <Pattern id="checker" patternUnits="userSpaceOnUse" width={height * 2} height={height * 2}>
          <Rect width={height * 2} height={height * 2} fill={colors.creamDeep} />
          <Rect width={height} height={height} fill={colors.cherry} />
          <Rect x={height} y={height} width={height} height={height} fill={colors.cherry} />
        </Pattern>
      </Defs>
      <Rect width="100%" height={height} fill="url(#checker)" />
    </Svg>
  );
}
