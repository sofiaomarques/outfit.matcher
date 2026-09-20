import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'app_colors.dart';

/// Tema visual do app: tipografia manuscrita nos títulos (remete ao
/// estilo "scrapbook" do mockup) e sans-serif arredondada no corpo.
class AppTheme {
  AppTheme._();

  static ThemeData get light {
    final textTheme = TextTheme(
      displayLarge: GoogleFonts.caveat(
        fontSize: 56,
        fontWeight: FontWeight.w700,
        color: AppColors.wine,
      ),
      headlineLarge: GoogleFonts.caveat(
        fontSize: 34,
        fontWeight: FontWeight.w700,
        color: AppColors.wine,
      ),
      headlineMedium: GoogleFonts.caveat(
        fontSize: 28,
        fontWeight: FontWeight.w700,
        color: AppColors.wine,
      ),
      titleLarge: GoogleFonts.quicksand(
        fontSize: 20,
        fontWeight: FontWeight.w700,
        color: AppColors.textDark,
      ),
      titleMedium: GoogleFonts.quicksand(
        fontSize: 16,
        fontWeight: FontWeight.w600,
        color: AppColors.textDark,
      ),
      bodyLarge: GoogleFonts.quicksand(
        fontSize: 16,
        color: AppColors.textDark,
      ),
      bodyMedium: GoogleFonts.quicksand(
        fontSize: 14,
        color: AppColors.textMuted,
      ),
      labelLarge: GoogleFonts.quicksand(
        fontSize: 14,
        fontWeight: FontWeight.w600,
        color: AppColors.cream,
      ),
    );

    return ThemeData(
      useMaterial3: true,
      scaffoldBackgroundColor: AppColors.cream,
      colorScheme: ColorScheme.fromSeed(
        seedColor: AppColors.wine,
        primary: AppColors.wine,
        secondary: AppColors.pink,
        surface: AppColors.cream,
      ),
      textTheme: textTheme,
      appBarTheme: AppBarTheme(
        backgroundColor: AppColors.cream,
        elevation: 0,
        titleTextStyle: textTheme.headlineMedium,
        iconTheme: const IconThemeData(color: AppColors.wine),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.wine,
          foregroundColor: AppColors.cream,
          padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 16),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(28),
          ),
          textStyle: textTheme.labelLarge,
        ),
      ),
      cardTheme: CardThemeData(
        color: Colors.white,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: BorderSide(color: AppColors.pink.withValues(alpha: 0.4)),
        ),
      ),
    );
  }
}
