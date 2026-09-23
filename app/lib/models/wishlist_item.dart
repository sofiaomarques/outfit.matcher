/// Uma peça que a usuária ainda não tem mas quer comprar: foto + descrição
/// livre (ex: "vestido floral, tamanho M, @loja"). Diferente de
/// [ClothingItem], não tem categoria nem cor — isso só importa pras peças
/// já no guarda-roupa.
class WishlistItem {
  const WishlistItem({
    required this.id,
    required this.description,
    this.imagePath,
    this.imageUrl,
  });

  final String id;
  final String description;

  /// Caminho no Supabase Storage (bucket `wishlist-images`), usado só pra
  /// remover a foto quando o item é excluído.
  final String? imagePath;

  /// URL (assinada) da foto no Supabase Storage.
  final String? imageUrl;
}
