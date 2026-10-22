/**
 * Uma peça que a usuária ainda não tem mas quer comprar: foto + descrição
 * livre. Diferente de ClothingItem, não tem categoria nem cor.
 */
export interface WishlistItem {
  id: string;
  description: string;
  /** Caminho no Storage (bucket `wishlist-images`), usado só pra remover a foto. */
  imagePath?: string;
  /** URL (assinada) da foto. */
  imageUrl?: string;
  /** Quando `imageUrl` vence (ms desde a época); ver `needsUrlRefresh`. */
  imageUrlExpiresAt?: number;
}
