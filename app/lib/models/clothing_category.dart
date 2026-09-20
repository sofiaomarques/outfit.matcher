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
}
