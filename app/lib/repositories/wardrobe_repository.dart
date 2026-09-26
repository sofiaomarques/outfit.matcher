import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:uuid/uuid.dart';

import '../models/clothing_category.dart';
import '../models/clothing_item.dart';

/// Acesso ao guarda-roupa do usuário logado.
///
/// Metadados de cada peça ficam na tabela `clothing_items` e a foto em si
/// no bucket `clothing-images`, isolados por usuário via Row Level
/// Security — ver `supabase/schema.sql`. As features extraídas pela API
/// Python (`/items/analyze`) ficam na coluna jsonb `features`; peças salvas
/// com a API fora do ar entram com `features` nulo e podem ser analisadas
/// depois via [updateFeatures].
class WardrobeRepository {
  WardrobeRepository({SupabaseClient? client})
    : _client = client ?? Supabase.instance.client;

  final SupabaseClient _client;
  static const _table = 'clothing_items';
  static const _bucket = 'clothing-images';
  static const _signedUrlTtlSeconds = 3600;

  String get _userId {
    final user = _client.auth.currentUser;
    if (user == null) {
      throw StateError('Usuário não autenticado.');
    }
    return user.id;
  }

  Future<List<ClothingItem>> fetchItems() async {
    final rows = await _client
        .from(_table)
        .select()
        .order('created_at', ascending: false);

    return Future.wait(rows.map((row) => _toClothingItem(row)));
  }

  Future<ClothingItem> addItem({
    required String name,
    required ClothingCategory category,
    required Uint8List imageBytes,
    required Color swatch,
    Map<String, dynamic>? features,
  }) async {
    final userId = _userId;
    final id = const Uuid().v4();
    final contentType = _detectImageContentType(imageBytes);
    final extensao = contentType == 'image/png' ? 'png' : 'jpg';
    final storagePath = '$userId/$id.$extensao';

    await _client.storage
        .from(_bucket)
        .uploadBinary(
          storagePath,
          imageBytes,
          fileOptions: FileOptions(contentType: contentType),
        );

    final row = await _client
        .from(_table)
        .insert({
          'id': id,
          'user_id': userId,
          'name': name,
          'category': category.name,
          'image_path': storagePath,
          'swatch_color': swatch.toARGB32(),
          'features': features,
        })
        .select()
        .single();

    return _toClothingItem(row);
  }

  Future<void> setFavorite(ClothingItem item, bool isFavorite) {
    return _client
        .from(_table)
        .update({'is_favorite': isFavorite})
        .eq('id', item.id);
  }

  Future<void> updateFeatures(
    ClothingItem item,
    Map<String, dynamic> features, {
    Color? swatch,
  }) {
    return _client
        .from(_table)
        .update({'features': features, 'swatch_color': ?swatch?.toARGB32()})
        .eq('id', item.id);
  }

  /// Baixa a foto já salva de uma peça — usado pra analisar peças antigas,
  /// cadastradas antes da análise automática existir.
  Future<Uint8List> downloadImage(ClothingItem item) {
    return _client.storage.from(_bucket).download(item.storagePath!);
  }

  Future<void> deleteItem(ClothingItem item) async {
    await _client.from(_table).delete().eq('id', item.id);
    if (item.storagePath != null) {
      await _client.storage.from(_bucket).remove([item.storagePath!]);
    }
  }

  Future<ClothingItem> _toClothingItem(Map<String, dynamic> row) async {
    final imagePath = row['image_path'] as String;
    final imageUrl = await _client.storage
        .from(_bucket)
        .createSignedUrl(imagePath, _signedUrlTtlSeconds);

    return ClothingItem(
      id: row['id'] as String,
      name: row['name'] as String,
      category: ClothingCategory.values.byName(row['category'] as String),
      swatch: Color(row['swatch_color'] as int),
      imageUrl: imageUrl,
      storagePath: imagePath,
      isFavorite: row['is_favorite'] as bool,
      features: row['features'] as Map<String, dynamic>?,
    );
  }
}

/// Detecta PNG (assinatura `\x89PNG`) vs JPEG pelos bytes: a foto pode
/// chegar já recortada em PNG (com transparência, via `/items/crop`) ou
/// ainda em JPEG cru, se o serviço de recorte estiver fora do ar.
String _detectImageContentType(Uint8List bytes) {
  const pngSignature = [0x89, 0x50, 0x4E, 0x47];
  final isPng =
      bytes.length >= pngSignature.length &&
      Iterable.generate(
        pngSignature.length,
      ).every((i) => bytes[i] == pngSignature[i]);
  return isPng ? 'image/png' : 'image/jpeg';
}
