import { Caveat_700Bold } from '@expo-google-fonts/caveat';
import { Nunito_600SemiBold } from '@expo-google-fonts/nunito';
import {
  Quicksand_400Regular,
  Quicksand_500Medium,
  Quicksand_600SemiBold,
  Quicksand_700Bold,
} from '@expo-google-fonts/quicksand';
import { colors } from './colors';

export const fontAssets = {
  Caveat_700Bold,
  Nunito_600SemiBold,
  Quicksand_400Regular,
  Quicksand_500Medium,
  Quicksand_600SemiBold,
  Quicksand_700Bold,
};

/** Tipografia manuscrita nos títulos (estilo scrapbook), sans arredondada no corpo. */
export const text = {
  displayLarge: { fontFamily: 'Caveat_700Bold', fontSize: 56, color: colors.wine },
  headlineLarge: { fontFamily: 'Caveat_700Bold', fontSize: 34, color: colors.wine },
  headlineMedium: { fontFamily: 'Caveat_700Bold', fontSize: 28, color: colors.wine },
  titleLarge: { fontFamily: 'Quicksand_700Bold', fontSize: 20, color: colors.textDark },
  titleMedium: { fontFamily: 'Quicksand_600SemiBold', fontSize: 16, color: colors.textDark },
  bodyLarge: { fontFamily: 'Quicksand_400Regular', fontSize: 16, color: colors.textDark },
  bodyMedium: { fontFamily: 'Quicksand_400Regular', fontSize: 14, color: colors.textMuted },
  label: { fontFamily: 'Quicksand_600SemiBold', fontSize: 14, color: colors.cream },
} as const;
