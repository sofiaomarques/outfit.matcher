import 'package:flutter/material.dart';

import '../models/clothing_category.dart';
import '../models/clothing_item.dart';
import '../models/outfit.dart';

/// Dados fake usados enquanto o pipeline em Python (model/gerar_outfit.py)
/// nao esta conectado a interface. O formato dos looks (peças + score)
/// segue o mesmo contrato que o modelo real ja retorna.
class MockWardrobe {
  MockWardrobe._();

  static const regataXadrez = ClothingItem(
    id: 'top-1',
    name: 'Regata xadrez vinho',
    category: ClothingCategory.top,
    swatch: Color(0xFFB3294A),
  );

  static const trico = ClothingItem(
    id: 'top-2',
    name: 'Tricô creme',
    category: ClothingCategory.top,
    swatch: Color(0xFFEFE3CF),
  );

  static const camisetaListrada = ClothingItem(
    id: 'top-3',
    name: 'Camiseta listrada',
    category: ClothingCategory.top,
    swatch: Color(0xFF4A2E2A),
  );

  static const calcaJeans = ClothingItem(
    id: 'bottom-1',
    name: 'Calça jeans wide leg',
    category: ClothingCategory.bottom,
    swatch: Color(0xFF6E87A8),
  );

  static const calcaAlfaiataria = ClothingItem(
    id: 'bottom-2',
    name: 'Calça alfaiataria off-white',
    category: ClothingCategory.bottom,
    swatch: Color(0xFFEFE6D8),
  );

  static const saiaBordo = ClothingItem(
    id: 'skirt-1',
    name: 'Saia bordô',
    category: ClothingCategory.skirt,
    swatch: Color(0xFF6E1B2E),
  );

  static const vestidoXadrez = ClothingItem(
    id: 'dress-1',
    name: 'Vestido xadrez',
    category: ClothingCategory.dress,
    swatch: Color(0xFF8A2A3A),
  );

  static const bolsaOncinha = ClothingItem(
    id: 'acc-1',
    name: 'Bolsa oncinha',
    category: ClothingCategory.accessory,
    swatch: Color(0xFFA9784C),
  );

  static const bolsaBordo = ClothingItem(
    id: 'acc-2',
    name: 'Bolsa bordô',
    category: ClothingCategory.accessory,
    swatch: Color(0xFF7A1836),
  );

  /// Todas as peças do guarda-roupa, exibidas em "Meu guarda-roupa".
  static const List<ClothingItem> items = [
    regataXadrez,
    trico,
    calcaJeans,
    saiaBordo,
    camisetaListrada,
    bolsaOncinha,
    calcaAlfaiataria,
    vestidoXadrez,
    bolsaBordo,
  ];

  /// Looks sugeridos, exibidos em "Seus looks".
  static const List<Outfit> outfits = [
    Outfit(
      id: 'look-1',
      items: [regataXadrez, calcaJeans, bolsaBordo],
      tags: ['Casual', 'Primavera/Verão'],
      score: 0.95,
    ),
    Outfit(
      id: 'look-2',
      items: [trico, saiaBordo, bolsaOncinha],
      tags: ['Casual', 'Outono/Inverno'],
      score: 0.9,
    ),
    Outfit(
      id: 'look-3',
      items: [camisetaListrada, calcaJeans],
      tags: ['Casual', 'Qualquer estação'],
      score: 0.82,
    ),
    Outfit(
      id: 'look-4',
      items: [vestidoXadrez, bolsaBordo],
      tags: ['Casual', 'Primavera/Verão'],
      score: 0.88,
    ),
    Outfit(
      id: 'look-5',
      items: [regataXadrez, calcaAlfaiataria, bolsaOncinha],
      tags: ['Trabalho', 'Qualquer estação'],
      score: 0.79,
    ),
    Outfit(
      id: 'look-6',
      items: [regataXadrez, calcaAlfaiataria],
      tags: ['Casual', 'Primavera/Verão'],
      score: 0.85,
    ),
  ];

  /// Look em destaque na tela "Look do dia".
  static const Outfit lookDoDia = Outfit(
    id: 'look-of-the-day',
    items: [regataXadrez, calcaJeans, bolsaBordo],
    tags: ['Casual', 'Primavera/Verão', 'Cores complementares'],
    score: 0.95,
  );
}
