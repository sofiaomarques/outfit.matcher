import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/clothing_item.dart';
import '../models/outfit.dart';
import '../repositories/wardrobe_repository.dart';
import 'api_config.dart';
import 'garment_analysis_service.dart';

/// Ocasiões de "Novo look" -> chave aceita por `/looks/recommend`
/// (`OCASIOES` em `model/recomendar.py`).
const Map<String, String> occasionKeys = {
  'Casual': 'casual',
  'Trabalho': 'trabalho',
  'Festa': 'festa',
  'Encontro': 'encontro',
  'Dia a dia': 'dia_a_dia',
};

/// Filtros de clima de "Seus looks" -> chave de `CLIMAS` no recomendador.
/// "Qualquer clima" fica de fora de propósito: é o mesmo que não mandar.
const Map<String, String> weatherKeys = {
  'Calor': 'calor',
  'Frio': 'frio',
  'Chuva': 'chuva',
};

/// Monta looks com as peças reais do guarda-roupa, chamando o recomendador
/// da API Python (`model/recomendar.py`): compatibilidade entre as peças
/// (modelo treinado) + ocasião + clima, com variedade entre os looks.
class RecommendationService {
  RecommendationService(
    this._repository, {
    GarmentAnalysisService? analysisService,
  }) : _analysisService = analysisService ?? GarmentAnalysisService();

  final WardrobeRepository _repository;
  final GarmentAnalysisService _analysisService;

  /// Mesmo valor de `VERSAO_FEATURES` em `features/embedding_neural.py`.
  /// Peças analisadas com versão anterior são reanalisadas.
  static const featuresVersion = 2;

  static bool _needsAnalysis(ClothingItem item) {
    final version = item.features?['versao_features'] as int? ?? 1;
    return item.features == null || version < featuresVersion;
  }

  /// Busca o guarda-roupa e analisa as peças sem features (cadastradas
  /// antes da análise automática, ou com a API fora do ar no upload) ou com
  /// features de uma versão antiga do pipeline, salvando o resultado no
  /// Supabase. Se a análise falhar, a peça fica como estava — sem features,
  /// o recomendador só a ignora.
  Future<List<ClothingItem>> loadWardrobe({
    void Function(int done, int total)? onProgress,
  }) async {
    final items = await _repository.fetchItems();
    final missing = items
        .where((item) => _needsAnalysis(item) && item.storagePath != null)
        .toList();
    if (missing.isEmpty) return items;

    final analyzed = <String, ClothingItem>{};
    for (final (index, item) in missing.indexed) {
      onProgress?.call(index, missing.length);
      try {
        final bytes = await _repository.downloadImage(item);
        final features = await _analysisService.analisarPeca(bytes);
        final swatch = swatchFromFeatures(features);
        await _repository.updateFeatures(item, features, swatch: swatch);
        analyzed[item.id] = item.copyWith(swatch: swatch, features: features);
      } catch (_) {
        // Segue sem essa peça; tenta de novo na próxima vez que a tela abrir.
      }
    }
    onProgress?.call(missing.length, missing.length);
    return [for (final item in items) analyzed[item.id] ?? item];
  }

  /// Pede os [topK] melhores looks. [occasion] e [weather] são os rótulos
  /// da interface (ex.: 'Trabalho', 'Frio'); nulos = sem filtro.
  Future<List<Outfit>> recommend(
    List<ClothingItem> items, {
    String? occasion,
    String? weather,
    int topK = 12,
  }) async {
    final analyzed = items.where((item) => item.features != null).toList();
    if (analyzed.isEmpty) return [];

    final response = await http
        .post(
          Uri.parse('${ApiConfig.baseUrl}/looks/recommend'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({
            'pecas': [
              for (final item in analyzed)
                {
                  'id': item.id,
                  'categoria': item.category.name,
                  'features': item.features,
                },
            ],
            'ocasiao': occasionKeys[occasion],
            'clima': weatherKeys[weather],
            'top_k': topK,
          }),
        )
        .timeout(const Duration(seconds: 30));
    if (response.statusCode != 200) {
      throw Exception('Falha ao gerar looks (${response.statusCode})');
    }

    final byId = {for (final item in analyzed) item.id: item};
    final looks = (jsonDecode(response.body)['looks'] as List<dynamic>)
        .cast<Map<String, dynamic>>();
    final tags = [?occasion, if (weatherKeys.containsKey(weather)) weather!];
    return [
      for (final look in looks)
        Outfit(
          id: (look['pecas'] as List<dynamic>).join('+'),
          items: [for (final id in look['pecas'] as List<dynamic>) byId[id]!],
          tags: tags,
          score: (look['score'] as num).toDouble(),
        ),
    ];
  }
}
