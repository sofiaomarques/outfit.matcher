import 'package:flutter/material.dart';

/// Categorias de peça exibidas nas abas do guarda-roupa.
enum ClothingCategory {
  top('Tops', Icons.checkroom),
  bottom('Calças', Icons.dry_cleaning),
  skirt('Saias', Icons.woman),
  dress('Vestidos', Icons.style),
  accessory('Acessórios', Icons.shopping_bag_outlined);

  const ClothingCategory(this.label, this.icon);

  final String label;
  final IconData icon;

  /// Categoria do app para o `categoria_codigo` de `/items/analyze`
  /// (`categoria_map` em `features/categoria.py`). O classificador não
  /// detecta acessório; código desconhecido ou nulo dá nulo.
  static ClothingCategory? fromDetectedCode(int? code) => switch (code) {
    1 || 2 => bottom,
    3 => skirt,
    4 => dress,
    final int c when c >= 5 && c <= 10 => top,
    _ => null,
  };
}
