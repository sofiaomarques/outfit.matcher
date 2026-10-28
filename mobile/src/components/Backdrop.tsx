import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Pattern, Rect } from 'react-native-svg';

import { colors } from '../theme/colors';

interface BackdropProps {
  /** `soft` serve de fundo pras telas internas; `bold` é o listrado das telas de entrada. */
  tone?: 'soft' | 'bold';
}

/** Fundo de listras verticais rosa e branco (papel de presente), ocupa o pai inteiro. */
export function Backdrop({ tone = 'bold' }: BackdropProps) {
  const stripe = tone === 'bold' ? colors.pinkLight : colors.pinkPale;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id="stripes" patternUnits="userSpaceOnUse" width={44} height={44}>
            <Rect width={44} height={44} fill={colors.paper} />
            <Rect width={22} height={44} fill={stripe} />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#stripes)" />
      </Svg>
    </View>
  );
}
