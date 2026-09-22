import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'screens/auth_screen.dart';
import 'screens/looks_screen.dart';
import 'screens/new_look_screen.dart';
import 'screens/placeholder_screen.dart';
import 'screens/wardrobe_screen.dart';
import 'services/supabase_config.dart';
import 'theme/app_theme.dart';
import 'widgets/app_shell.dart';
import 'widgets/painted_heart.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  if (SupabaseConfig.isConfigured) {
    await Supabase.initialize(
      url: SupabaseConfig.url,
      publishableKey: SupabaseConfig.anonKey,
    );
  }

  runApp(const OutfitMatcherApp());
}

class OutfitMatcherApp extends StatelessWidget {
  const OutfitMatcherApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Wable',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      home: SupabaseConfig.isConfigured
          ? const _RootNavigator()
          : const _MissingConfigScreen(),
    );
  }
}

/// Mostrada quando o app roda sem `--dart-define=SUPABASE_URL=...
/// --dart-define=SUPABASE_ANON_KEY=...` (ver `lib/services/supabase_config.dart`).
class _MissingConfigScreen extends StatelessWidget {
  const _MissingConfigScreen();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Text(
            'Configuração do Supabase ausente.\n\n'
            'Rode o app com:\n'
            'flutter run --dart-define=SUPABASE_URL=... '
            '--dart-define=SUPABASE_ANON_KEY=...',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyLarge,
          ),
        ),
      ),
    );
  }
}

/// Controla a navegação de acordo com o estado de autenticação (Supabase
/// Auth): tela de boas-vindas/login enquanto deslogado, navegação entre
/// guarda-roupa / looks / favoritos / configurações depois de logado.
class _RootNavigator extends StatefulWidget {
  const _RootNavigator();

  @override
  State<_RootNavigator> createState() => _RootNavigatorState();
}

class _RootNavigatorState extends State<_RootNavigator> {
  int _selectedIndex = 0;

  static const _screens = [
    WardrobeScreen(),
    NewLookScreen(),
    LooksScreen(),
    PlaceholderScreen(
      title: 'Favoritos',
      icon: PaintedHeart(size: 48),
    ),
    PlaceholderScreen(title: 'Configurações'),
  ];

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<AuthState>(
      stream: Supabase.instance.client.auth.onAuthStateChange,
      builder: (context, snapshot) {
        final session = Supabase.instance.client.auth.currentSession;
        if (session == null) {
          return const AuthScreen();
        }

        return AppShell(
          selectedIndex: _selectedIndex,
          onDestinationSelected: (index) =>
              setState(() => _selectedIndex = index),
          body: IndexedStack(index: _selectedIndex, children: _screens),
        );
      },
    );
  }
}
