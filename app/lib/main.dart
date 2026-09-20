import 'package:flutter/material.dart';

import 'screens/looks_screen.dart';
import 'screens/placeholder_screen.dart';
import 'screens/wardrobe_screen.dart';
import 'screens/welcome_screen.dart';
import 'theme/app_theme.dart';
import 'widgets/app_shell.dart';

void main() {
  runApp(const OutfitMatcherApp());
}

class OutfitMatcherApp extends StatelessWidget {
  const OutfitMatcherApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Outfit Matcher',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      home: const _RootNavigator(),
    );
  }
}

/// Controla a transição da tela inicial pro app principal (com navegação
/// entre guarda-roupa / looks / favoritos / configurações).
class _RootNavigator extends StatefulWidget {
  const _RootNavigator();

  @override
  State<_RootNavigator> createState() => _RootNavigatorState();
}

class _RootNavigatorState extends State<_RootNavigator> {
  bool _started = false;
  int _selectedIndex = 0;

  static const _screens = [
    WardrobeScreen(),
    LooksScreen(),
    PlaceholderScreen(title: 'Favoritos'),
    PlaceholderScreen(title: 'Configurações'),
  ];

  @override
  Widget build(BuildContext context) {
    if (!_started) {
      return WelcomeScreen(onStart: () => setState(() => _started = true));
    }

    return AppShell(
      selectedIndex: _selectedIndex,
      onDestinationSelected: (index) =>
          setState(() => _selectedIndex = index),
      body: IndexedStack(index: _selectedIndex, children: _screens),
    );
  }
}
