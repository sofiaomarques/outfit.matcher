import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

/// Mensagem centralizada das telas de looks: carregando (com spinner),
/// erro (com "Tentar de novo") ou vazio.
class LooksStatus extends StatelessWidget {
  const LooksStatus({
    super.key,
    required this.message,
    this.isLoading = false,
    this.onRetry,
  });

  final String message;
  final bool isLoading;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (isLoading) ...[
            const CircularProgressIndicator(color: AppColors.wine),
            const SizedBox(height: 16),
          ],
          Text(
            message,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyLarge
                ?.copyWith(color: AppColors.textMuted),
          ),
          if (onRetry != null) ...[
            const SizedBox(height: 12),
            TextButton(onPressed: onRetry, child: const Text('Tentar de novo')),
          ],
        ],
      ),
    );
  }
}
