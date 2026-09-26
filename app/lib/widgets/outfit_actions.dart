import 'package:flutter/material.dart';

import '../models/outfit.dart';
import '../services/outfit_history.dart';

/// Favoritar/desfavoritar um look pelo [OutfitHistory] compartilhado,
/// avisando se não deu pra salvar.
Future<void> toggleOutfitFavorite(BuildContext context, Outfit outfit) async {
  final messenger = ScaffoldMessenger.of(context);
  final saved = await OutfitHistory.instance.toggleFavorite(outfit);
  if (!saved) {
    messenger.showSnackBar(
      const SnackBar(content: Text('Não foi possível salvar o favorito.')),
    );
  }
}

/// Marca o look como usado hoje, avisando o resultado.
Future<void> markOutfitWorn(BuildContext context, Outfit outfit) async {
  final messenger = ScaffoldMessenger.of(context);
  final saved = await OutfitHistory.instance.markWorn(outfit);
  messenger.showSnackBar(
    SnackBar(
      content: Text(
        saved
            ? 'Anotado: você usou esse look hoje.'
            : 'Não foi possível salvar. Tente de novo.',
      ),
    ),
  );
}
