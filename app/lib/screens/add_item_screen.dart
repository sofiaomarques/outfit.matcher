import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../models/clothing_category.dart';
import '../repositories/wardrobe_repository.dart';
import '../services/api_status.dart';
import '../services/garment_analysis_service.dart';
import '../theme/app_colors.dart';

typedef _Analysis = ({Map<String, dynamic>? features, bool skipped});

/// Escolhe a foto: câmera ou galeria. Nulo se a usuária desistir.
typedef ImagePick = Future<Uint8List?> Function(ImageSource source);

Future<Uint8List?> _pickWithImagePicker(ImageSource source) async {
  final picked = await ImagePicker().pickImage(
    source: source,
    maxWidth: 1600,
    imageQuality: 90,
  );
  return picked?.readAsBytes();
}

/// Tela de cadastro de uma peça nova: escolhe a foto (câmera ou galeria),
/// preenche nome e categoria, e salva no guarda-roupa. Assim que a foto é
/// escolhida, a API Python recorta a peça e, em paralelo, extrai as
/// features (cor real, formalidade, embedding) que o recomendador de looks
/// usa. A categoria detectada já vem marcada, mas a usuária pode corrigir
/// (a escolha dela é a que vale), e `features.categoria_sugerida` guarda o
/// que foi sugerido: cada correção vira um rótulo de foto real (#26). Com a
/// API acordando (cold start), dá pra salvar sem esperar: a peça vai sem
/// recorte e sem features, e é analisada depois em
/// `RecommendationService.loadWardrobe`.
class AddItemScreen extends StatefulWidget {
  const AddItemScreen({
    super.key,
    required this.repository,
    this.analysisService,
    this.pickImage = _pickWithImagePicker,
  });

  final WardrobeRepository repository;
  final GarmentAnalysisService? analysisService;
  final ImagePick pickImage;

  @override
  State<AddItemScreen> createState() => _AddItemScreenState();
}

class _AddItemScreenState extends State<AddItemScreen> {
  final _nameController = TextEditingController();
  late final _analysisService =
      widget.analysisService ?? GarmentAnalysisService();

  /// Sem padrão: vem da análise ou da usuária, pra categoria salva nunca ser
  /// um "Tops" que ninguém olhou.
  ClothingCategory? _category;

  /// A usuária tocou num chip: a análise não muda mais a escolha dela.
  bool _categoryChosen = false;
  ({ClothingCategory category, String name})? _detected;
  bool _isDetecting = false;
  Uint8List? _imageBytes;
  bool _isSaving = false;
  bool _isCropping = false;
  bool _isAnalyzing = false;

  /// Análise da foto original (não da recortada: o pipeline tem a própria
  /// segmentação). Nulo dentro do Future se a API falhar — a peça é salva
  /// mesmo assim, sem features.
  Future<Map<String, dynamic>?>? _analysis;
  String? _errorText;

  @override
  void initState() {
    super.initState();
    ApiStatus.instance.addListener(_onApiChange);
  }

  @override
  void dispose() {
    ApiStatus.instance.removeListener(_onApiChange);
    _nameController.dispose();
    super.dispose();
  }

  void _onApiChange() => setState(() {});

  Future<void> _pickImage(ImageSource source) async {
    final bytes = await widget.pickImage(source);
    if (bytes == null || !mounted) return;
    final analysis = _analisarSemFalhar(bytes);
    setState(() {
      // Foto trocada: a categoria era da peça anterior. Escolha feita antes
      // da primeira foto continua valendo.
      if (_imageBytes != null) {
        _category = null;
        _categoryChosen = false;
      }
      _imageBytes = bytes;
      _isCropping = true;
      _analysis = analysis;
      _detected = null;
      _isDetecting = true;
    });
    analysis.then((features) => _onAnalysis(analysis, features));

    try {
      final recorte = await _analysisService.recortarPeca(bytes);
      if (mounted) setState(() => _imageBytes = recorte);
    } catch (_) {
      // Serviço de recorte fora do ar ou falhou: mantém a foto original em
      // vez de travar o cadastro da peça.
    } finally {
      if (mounted) setState(() => _isCropping = false);
    }
  }

  void _onAnalysis(
    Future<Map<String, dynamic>?> analysis,
    Map<String, dynamic>? features,
  ) {
    // Análise de uma foto que já foi trocada por outra.
    if (!mounted || analysis != _analysis) return;
    final detected = detectedCategory(features);
    setState(() {
      _isDetecting = false;
      _detected = detected;
      if (detected != null && !_categoryChosen && !_isSaving) {
        _category = detected.category;
      }
    });
  }

  Future<Map<String, dynamic>?> _analisarSemFalhar(Uint8List bytes) async {
    try {
      return await _analysisService.analisarPeca(bytes);
    } catch (_) {
      return null;
    }
  }

  /// Features da análise, ou nulo sem esperar se a API estiver acordando
  /// (agora ou durante a espera): aí a análise pode levar minutos.
  Future<_Analysis> _featuresOrSkip() async {
    final api = ApiStatus.instance;
    final done = Completer<_Analysis>();
    void finish(_Analysis analysis) {
      if (!done.isCompleted) done.complete(analysis);
    }

    void onApiChange() {
      if (api.isWaking) finish((features: null, skipped: true));
    }

    onApiChange();
    api.addListener(onApiChange);
    _analysis!.then((features) => finish((features: features, skipped: false)));
    try {
      return await done.future;
    } finally {
      api.removeListener(onApiChange);
    }
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
    if (_nameController.text.trim().isEmpty) {
      setState(() => _errorText = 'Dê um nome pra peça.');
      return;
    }
    if (_category == null && _isDetecting && !ApiStatus.instance.isWaking) {
      // A análise ainda roda (o "Salvar" libera com o fim do recorte):
      // espera a detecção em vez de pedir a categoria.
      setState(() {
        _isSaving = true;
        _isAnalyzing = true;
        _errorText = null;
      });
      await _featuresOrSkip();
      if (!mounted) return;
      setState(() {
        _isSaving = false;
        _isAnalyzing = false;
        // `_onAnalysis` não mexe no chip durante o salvamento.
        _category ??= _detected?.category;
      });
    }
    final category = _category;
    if (category == null) {
      setState(() => _errorText = 'Escolha a categoria da peça.');
      return;
    }
    final suggested = _detected?.category;

    setState(() {
      _isSaving = true;
      _errorText = null;
    });

    try {
      setState(() => _isAnalyzing = true);
      final (:features, :skipped) = await _featuresOrSkip();
      if (mounted) setState(() => _isAnalyzing = false);

      await widget.repository.addItem(
        name: _nameController.text.trim(),
        category: category,
        imageBytes: _imageBytes!,
        swatch: swatchFromFeatures(features) ?? AppColors.pink,
        features: features == null
            ? null
            : {...features, 'categoria_sugerida': ?suggested?.name},
      );
      if (!mounted) return;
      if (skipped) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Peça salva! O servidor ainda está acordando, então ela é '
              'analisada depois.',
            ),
          ),
        );
      }
      Navigator.of(context).pop(true);
    } catch (_) {
      setState(() => _errorText = 'Não foi possível salvar. Tente de novo.');
    } finally {
      if (mounted) {
        setState(() {
          _isSaving = false;
          _isAnalyzing = false;
        });
      }
    }
  }

  String? _categoryHint() {
    if (_detected case (:final name, :final category)) {
      final nome = '${name[0].toUpperCase()}${name.substring(1)}';
      return category == _category
          ? 'Detectamos: $nome. Confere? Se não, toque na certa.'
          : 'Detectamos: $nome.';
    }
    if (_isDetecting && !ApiStatus.instance.isWaking) {
      return 'Detectando a categoria...';
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    // Acordando, o recorte pode levar minutos: não trava o "Salvar".
    final waking = ApiStatus.instance.isWaking;
    return Scaffold(
      appBar: AppBar(title: const Text('Nova peça')),
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
                      : Stack(
                          fit: StackFit.expand,
                          children: [
                            ClipRRect(
                              borderRadius: BorderRadius.circular(16),
                              child: Image.memory(
                                _imageBytes!,
                                fit: BoxFit.cover,
                              ),
                            ),
                            if (_isCropping)
                              ColoredBox(
                                color: Colors.black.withValues(alpha: 0.35),
                                child: Center(
                                  child: Column(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      const CircularProgressIndicator(
                                        color: Colors.white,
                                      ),
                                      const SizedBox(height: 12),
                                      Text(
                                        waking
                                            ? 'Acordando o servidor...'
                                            : 'Recortando a peça...',
                                        style: const TextStyle(
                                          color: Colors.white,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                          ],
                        ),
                ),
              ),
            ),
            if (waking && _imageBytes != null) ...[
              const SizedBox(height: 12),
              Text(
                'O servidor está acordando (pode levar até 2 minutos). Se '
                'não quiser esperar, pode salvar: a peça fica sem recorte e '
                'é analisada depois.',
                style: Theme.of(context).textTheme.bodyMedium
                    ?.copyWith(color: AppColors.textMuted),
              ),
            ],
            const SizedBox(height: 20),
            TextField(
              controller: _nameController,
              decoration: const InputDecoration(labelText: 'Nome da peça'),
            ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final category in ClothingCategory.values)
                  ChoiceChip(
                    label: Text(category.label),
                    selected: _category == category,
                    onSelected: (_) => setState(() {
                      _category = category;
                      _categoryChosen = true;
                    }),
                  ),
              ],
            ),
            if (_categoryHint() case final hint?) ...[
              const SizedBox(height: 8),
              Text(
                hint,
                style: Theme.of(context).textTheme.bodyMedium
                    ?.copyWith(color: AppColors.textMuted),
              ),
            ],
            if (_errorText != null) ...[
              const SizedBox(height: 12),
              Text(_errorText!, style: const TextStyle(color: AppColors.error)),
            ],
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: (_isSaving || (_isCropping && !waking)) ? null : _save,
              child: _isAnalyzing
                  ? const Text('Analisando a peça...')
                  : _isSaving
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
