import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../repositories/wishlist_repository.dart';
import '../theme/app_colors.dart';

/// Tela de cadastro de um item da wishlist: escolhe a foto (câmera ou
/// galeria), escreve uma descrição livre e salva.
class AddWishlistItemScreen extends StatefulWidget {
  const AddWishlistItemScreen({super.key, required this.repository});

  final WishlistRepository repository;

  @override
  State<AddWishlistItemScreen> createState() => _AddWishlistItemScreenState();
}

class _AddWishlistItemScreenState extends State<AddWishlistItemScreen> {
  final _descriptionController = TextEditingController();
  Uint8List? _imageBytes;
  bool _isSaving = false;
  String? _errorText;

  @override
  void dispose() {
    _descriptionController.dispose();
    super.dispose();
  }

  Future<void> _pickImage(ImageSource source) async {
    final picked = await ImagePicker().pickImage(
      source: source,
      maxWidth: 1600,
      imageQuality: 90,
    );
    if (picked == null) return;
    final bytes = await picked.readAsBytes();
    setState(() => _imageBytes = bytes);
  }

  void _showImageSourceSheet() {
    showModalBottomSheet(
      context: context,
      builder: (context) => SafeArea(
        child: Wrap(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 4),
              child: Text(
                'De onde vem a foto?',
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ),
            ListTile(
              leading: const Icon(
                Icons.photo_camera_outlined,
                color: AppColors.wine,
              ),
              title: const Text('Tirar foto'),
              onTap: () {
                Navigator.of(context).pop();
                _pickImage(ImageSource.camera);
              },
            ),
            ListTile(
              leading: const Icon(
                Icons.photo_library_outlined,
                color: AppColors.wine,
              ),
              title: const Text('Escolher da galeria'),
              onTap: () {
                Navigator.of(context).pop();
                _pickImage(ImageSource.gallery);
              },
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  Future<void> _save() async {
    if (_imageBytes == null) {
      setState(() => _errorText = 'Escolha uma foto primeiro.');
      return;
    }
    if (_descriptionController.text.trim().isEmpty) {
      setState(() => _errorText = 'Escreva uma descrição pra peça.');
      return;
    }

    setState(() {
      _isSaving = true;
      _errorText = null;
    });

    try {
      await widget.repository.addItem(
        description: _descriptionController.text.trim(),
        imageBytes: _imageBytes!,
      );
      if (mounted) Navigator.of(context).pop(true);
    } catch (_) {
      setState(() => _errorText = 'Não foi possível salvar. Tente de novo.');
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Nova peça da wishlist')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            GestureDetector(
              onTap: _showImageSourceSheet,
              child: AspectRatio(
                aspectRatio: 1,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    color: AppColors.pinkLight,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(
                      color: AppColors.pink.withValues(alpha: 0.6),
                      width: 1.5,
                    ),
                  ),
                  child: _imageBytes == null
                      ? const Center(
                          child: Icon(
                            Icons.add_a_photo_outlined,
                            size: 40,
                            color: AppColors.wine,
                          ),
                        )
                      : ClipRRect(
                          borderRadius: BorderRadius.circular(16),
                          child: Image.memory(_imageBytes!, fit: BoxFit.cover),
                        ),
                ),
              ),
            ),
            const SizedBox(height: 20),
            TextField(
              controller: _descriptionController,
              minLines: 2,
              maxLines: 4,
              decoration: const InputDecoration(
                labelText: 'Descrição',
                hintText: 'Ex: vestido floral, tamanho M, @loja',
              ),
            ),
            if (_errorText != null) ...[
              const SizedBox(height: 12),
              Text(
                _errorText!,
                style: const TextStyle(color: AppColors.error),
              ),
            ],
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: _isSaving ? null : _save,
              child: _isSaving
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Salvar'),
            ),
          ],
        ),
      ),
    );
  }
}
