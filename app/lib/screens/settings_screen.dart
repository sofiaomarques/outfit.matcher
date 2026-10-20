import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../repositories/account_repository.dart';
import '../theme/app_colors.dart';

/// Versão do build, passada com `--dart-define=APP_VERSION=...` (ex.: o
/// hash do commit). Sem ela, "dev".
const appVersion = String.fromEnvironment('APP_VERSION', defaultValue: 'dev');

/// Link pra mandar feedback (ex.: um formulário), passado com
/// `--dart-define=FEEDBACK_URL=...`. Sem ele, a opção não aparece.
const feedbackUrl = String.fromEnvironment('FEEDBACK_URL');

/// Tela "Configurações": conta logada, sair, apagar tudo o que a usuária
/// enviou (peças, wishlist, looks e fotos) e sobre o app.
class SettingsScreen extends StatefulWidget {
  const SettingsScreen({
    super.key,
    required this.onDataErased,
    this.repository,
    this.feedbackLink = feedbackUrl,
  });

  /// Chamado depois de apagar tudo, pra as outras telas recarregarem vazias.
  final VoidCallback onDataErased;
  final AccountRepository? repository;
  final String feedbackLink;

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  // Criado só no primeiro uso: `Supabase.instance` não existe nos testes.
  late final _repository = widget.repository ?? AccountRepository();
  bool _isErasing = false;

  Future<void> _signOut() async {
    try {
      await _repository.signOut();
    } catch (_) {
      _showMessage('Não foi possível sair. Tente de novo.');
    }
  }

  Future<void> _confirmErase() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Apagar meus dados?'),
        content: const Text(
          'Isso apaga todas as suas peças, a wishlist, os looks favoritos, '
          'usados e rejeitados, e todas as fotos que você enviou. Não dá pra '
          'desfazer. Sua conta continua existindo.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancelar'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: TextButton.styleFrom(foregroundColor: AppColors.error),
            child: const Text('Apagar tudo'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _isErasing = true);
    try {
      await _repository.eraseMyData();
      if (!mounted) return;
      _showMessage('Pronto: seus dados e fotos foram apagados.');
      widget.onDataErased();
    } catch (_) {
      _showMessage(
        'Não foi possível apagar tudo. Tente de novo: o que já foi apagado '
        'não volta.',
      );
    } finally {
      if (mounted) setState(() => _isErasing = false);
    }
  }

  Future<void> _openFeedback() async {
    final uri = Uri.tryParse(widget.feedbackLink);
    final opened =
        uri != null &&
        await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!opened) _showMessage('Não foi possível abrir o link.');
  }

  void _showMessage(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final email = _repository.email;
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          Row(
            children: [
              const Icon(Icons.settings_outlined, color: AppColors.wine),
              const SizedBox(width: 10),
              Text('Configurações', style: textTheme.headlineLarge),
            ],
          ),
          const SizedBox(height: 24),
          _SectionTitle('Conta'),
          Card(
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(
                    Icons.person_outline,
                    color: AppColors.wine,
                  ),
                  title: Text(email ?? 'Conta sem e-mail'),
                  subtitle: const Text('Conta logada'),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.logout, color: AppColors.wine),
                  title: const Text('Sair'),
                  onTap: _isErasing ? null : _signOut,
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          _SectionTitle('Seus dados'),
          Card(
            child: ListTile(
              leading: _isErasing
                  ? const SizedBox(
                      width: 24,
                      height: 24,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.delete_outline, color: AppColors.error),
              title: Text(
                _isErasing ? 'Apagando...' : 'Apagar meus dados',
                style: const TextStyle(color: AppColors.error),
              ),
              subtitle: const Text(
                'Peças, wishlist, looks e todas as fotos enviadas',
              ),
              onTap: _isErasing ? null : _confirmErase,
            ),
          ),
          const SizedBox(height: 24),
          _SectionTitle('Sobre'),
          Card(
            child: Column(
              children: [
                const ListTile(
                  leading: Icon(Icons.info_outline, color: AppColors.wine),
                  title: Text('Wable'),
                  subtitle: Text('Versão $appVersion'),
                ),
                if (widget.feedbackLink.isNotEmpty) ...[
                  const Divider(height: 1),
                  ListTile(
                    leading: const Icon(
                      Icons.chat_bubble_outline,
                      color: AppColors.wine,
                    ),
                    title: const Text('Mandar feedback'),
                    trailing: const Icon(Icons.open_in_new, size: 18),
                    onTap: _openFeedback,
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 4, bottom: 8),
      child: Text(
        text,
        style: Theme.of(context).textTheme.titleMedium
            ?.copyWith(color: AppColors.textMuted),
      ),
    );
  }
}
