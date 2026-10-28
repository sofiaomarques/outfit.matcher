import { PlayfairDisplay_600SemiBold_Italic, PlayfairDisplay_700Bold } from '@expo-google-fonts/playfair-display';
import { Nunito_600SemiBold } from '@expo-google-fonts/nunito';
import {
  Quicksand_400Regular,
  Quicksand_500Medium,
  Quicksand_600SemiBold,
  Quicksand_700Bold,
} from '@expo-google-fonts/quicksand';
import { colors } from './colors';

export const fontAssets = {
  PlayfairDisplay_600SemiBold_Italic,
  PlayfairDisplay_700Bold,
  Nunito_600SemiBold,
  Quicksand_400Regular,
  Quicksand_500Medium,
  Quicksand_600SemiBold,
  Quicksand_700Bold,
};

/** Serifada elegante (Playfair) nos títulos, sans arredondada no corpo. */
export const text = {
  displayLarge: { fontFamily: 'PlayfairDisplay_600SemiBold_Italic', fontSize: 44, lineHeight: 52, color: colors.wine },
  headlineLarge: { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 28, color: colors.wine },
  headlineMedium: { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 22, color: colors.wine },
  titleLarge: { fontFamily: 'Quicksand_700Bold', fontSize: 20, color: colors.textDark },
  titleMedium: { fontFamily: 'Quicksand_600SemiBold', fontSize: 16, color: colors.textDark },
  bodyLarge: { fontFamily: 'Quicksand_400Regular', fontSize: 16, color: colors.textDark },
  bodyMedium: { fontFamily: 'Quicksand_400Regular', fontSize: 14, color: colors.textMuted },
  label: { fontFamily: 'Quicksand_600SemiBold', fontSize: 14, color: colors.cream },
} as const;
