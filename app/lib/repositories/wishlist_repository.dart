import 'dart:typed_data';

import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:uuid/uuid.dart';

import '../models/wishlist_item.dart';

/// Acesso à wishlist do usuário logado: peças que ela ainda não tem mas
/// quer comprar, com foto + descrição livre.
///
/// Metadados ficam na tabela `wishlist_items` e a foto no bucket
/// `wishlist-images`, isolados por usuário via Row Level Security — ver
/// `supabase/schema.sql`.
class WishlistRepository {
  WishlistRepository({SupabaseClient? client})
    : _client = client ?? Supabase.instance.client;

  final SupabaseClient _client;
  static const _table = 'wishlist_items';
  static const _bucket = 'wishlist-images';
  static const _signedUrlTtlSeconds = 3600;

  String get _userId {
    final user = _client.auth.currentUser;
    if (user == null) {
      throw StateError('Usuário não autenticado.');
    }
    return user.id;
  }

  Future<List<WishlistItem>> fetchItems() async {
    final rows = await _client
        .from(_table)
        .select()
        .order('created_at', ascending: false);

    return Future.wait(rows.map((row) => _toWishlistItem(row)));
  }

  Future<WishlistItem> addItem({
    required String description,
    required Uint8List imageBytes,
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
          'description': description,
          'image_path': storagePath,
        })
        .select()
        .single();

    return _toWishlistItem(row);
  }

  Future<void> deleteItem(WishlistItem item) async {
    await _client.from(_table).delete().eq('id', item.id);
    if (item.imagePath != null) {
      await _client.storage.from(_bucket).remove([item.imagePath!]);
    }
  }

  Future<WishlistItem> _toWishlistItem(Map<String, dynamic> row) async {
    final imagePath = row['image_path'] as String;
    final imageUrl = await _client.storage
        .from(_bucket)
        .createSignedUrl(imagePath, _signedUrlTtlSeconds);

    return WishlistItem(
      id: row['id'] as String,
      description: row['description'] as String,
      imagePath: imagePath,
      imageUrl: imageUrl,
    );
  }
}

/// Detecta PNG (assinatura `\x89PNG`) vs JPEG pelos bytes.
String _detectImageContentType(Uint8List bytes) {
  const pngSignature = [0x89, 0x50, 0x4E, 0x47];
  final isPng =
      bytes.length >= pngSignature.length &&
      Iterable.generate(
        pngSignature.length,
      ).every((i) => bytes[i] == pngSignature[i]);
  return isPng ? 'image/png' : 'image/jpeg';
}
