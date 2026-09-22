import 'package:flutter/material.dart';

/// Paleta inspirada no moodboard do projeto: bordô, rosa e creme,
/// com toques de estampa de oncinha.
class AppColors {
  AppColors._();

  static const Color wine = Color(0xFF7A1836);
  static const Color wineDark = Color(0xFF5A1227);
  static const Color pink = Color(0xFFE8A0BF);
  static const Color pinkLight = Color(0xFFF7DCE7);
  static const Color pinkPale = Color(0xFFFBEAF1);
  static const Color cream = Color(0xFFFDF6EC);
  static const Color leopardBrown = Color(0xFFA9784C);
  static const Color denim = Color(0xFF6E87A8);
  static const Color textDark = Color(0xFF3D1220);
  static const Color textMuted = Color(0xFF8C6B75);

  /// Cor de erro/alerta em formulários — um vermelho-bordô, em vez do
  /// vermelho puro do Material, pra não destoar da paleta.
  static const Color error = Color(0xFFB3435C);
}
