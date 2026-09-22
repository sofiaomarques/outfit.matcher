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
/// Security — ver `supabase/schema.sql`. A extração de features (cor real,
/// categoria por CLIP etc, `features/*.py`) ainda não roda aqui: cada peça
/// nova entra com uma cor de placeholder e `features` nulo no banco,
/// prontos pra um pipeline futuro preencher.
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
  }) async {
    final userId = _userId;
    final id = const Uuid().v4();
    final storagePath = '$userId/$id.jpg';

    await _client.storage
        .from(_bucket)
        .uploadBinary(
          storagePath,
          imageBytes,
          fileOptions: const FileOptions(contentType: 'image/jpeg'),
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

  Future<void> deleteItem(ClothingItem item) async {
    await _client.from(_table).delete().eq('id', item.id);
    if (item.imagePath != null) {
      await _client.storage.from(_bucket).remove([item.imagePath!]);
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
      isFavorite: row['is_favorite'] as bool,
    );
  }
}
