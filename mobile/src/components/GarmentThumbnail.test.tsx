import { fireEvent, render, screen } from '@testing-library/react-native';

import type { ClothingItem } from '../models/clothingItem';
import { GarmentThumbnail, thumbnailUrl } from './GarmentThumbnail';

const SIGNED = 'https://x.supabase.co/storage/v1/object/sign/clothing-images/u/1.png?token=abc';

function item(overrides: Partial<ClothingItem> = {}): ClothingItem {
  return {
    id: '1',
    name: 'Camisa',
    category: 'top',
    swatch: 0xff112233,
    imageUrl: SIGNED,
    storagePath: 'u/1.png',
    isFavorite: false,
    features: null,
    ...overrides,
  } as ClothingItem;
}

describe('thumbnailUrl', () => {
  it('troca para o endpoint de transformação mantendo o token', () => {
    expect(thumbnailUrl(SIGNED, 440)).toBe(
      'https://x.supabase.co/storage/v1/render/image/sign/clothing-images/u/1.png?token=abc&width=440&height=440&resize=cover',
    );
  });

  it('deixa URLs de outro formato como estão', () => {
    expect(thumbnailUrl('https://exemplo.com/foto.png', 440)).toBe('https://exemplo.com/foto.png');
  });
});

describe('GarmentThumbnail', () => {
  it('pede a miniatura com chave de cache estável (sem o token)', async () => {
    await render(<GarmentThumbnail item={item()} />);
    const source = screen.getByLabelText('Camisa').props.source[0];
    expect(source.uri).toContain('/render/image/sign/');
    expect(source.cacheKey).toBe('u/1.png:440');
  });

  it('se a miniatura falha, tenta a foto original; se ela falha, mostra o placeholder', async () => {
    await render(<GarmentThumbnail item={item()} />);
    await fireEvent(screen.getByLabelText('Camisa'), 'error', { nativeEvent: { error: 'falhou' } });
    const original = screen.getByLabelText('Camisa').props.source[0];
    expect(original.uri).toBe(SIGNED);
    expect(original.cacheKey).toBe('u/1.png:original');

    await fireEvent(screen.getByLabelText('Camisa'), 'error', { nativeEvent: { error: 'falhou' } });
    expect(screen.queryByLabelText('Camisa')).toBeNull();
  });

  it('sem foto, mostra o placeholder', async () => {
    await render(<GarmentThumbnail item={item({ imageUrl: undefined })} />);
    expect(screen.queryByLabelText('Camisa')).toBeNull();
  });
});
