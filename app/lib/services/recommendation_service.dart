import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/clothing_item.dart';
import '../models/outfit.dart';
import '../repositories/wardrobe_repository.dart';
import 'api_config.dart';
import 'garment_analysis_service.dart';
import 'outfit_history.dart';

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
/// (modelo treinado) + ocasião + clima + feedback da usuária (favoritos,
/// rejeições e usos do [OutfitHistory]), com variedade entre os looks.
class RecommendationService {
  RecommendationService(
    this._repository, {
    GarmentAnalysisService? analysisService,
    OutfitHistory? history,
  }) : _analysisService = analysisService ?? GarmentAnalysisService(),
       _history = history ?? OutfitHistory.instance;

  final WardrobeRepository _repository;
  final GarmentAnalysisService _analysisService;
  final OutfitHistory _history;

  // "Novo look" e "Seus looks" nascem juntas (IndexedStack) e as duas
  // carregam o guarda-roupa: compartilham a mesma análise em andamento em
  // vez de analisar as mesmas peças duas vezes.
  static Future<List<ClothingItem>>? _pendingLoad;
  static final _progressListeners = <void Function(int done, int total)>{};

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
    if (onProgress != null) _progressListeners.add(onProgress);
    try {
      return await (_pendingLoad ??= _loadWardrobe().whenComplete(
        () => _pendingLoad = null,
      ));
    } finally {
      _progressListeners.remove(onProgress);
    }
  }

  void _notifyProgress(int done, int total) {
    for (final listener in _progressListeners.toList()) {
      listener(done, total);
    }
  }

  Future<List<ClothingItem>> _loadWardrobe() async {
    final items = await _repository.fetchItems();
    final missing = items
        .where((item) => _needsAnalysis(item) && item.storagePath != null)
        .toList();
    if (missing.isEmpty) return items;

    final analyzed = <String, ClothingItem>{};
    for (final (index, item) in missing.indexed) {
      _notifyProgress(index, missing.length);
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
    _notifyProgress(missing.length, missing.length);
    return [for (final item in items) analyzed[item.id] ?? item];
  }

  /// Pede os [topK] melhores looks. [occasion] e [weather] são os rótulos
  /// da interface (ex.: 'Trabalho', 'Frio'); nulos = sem filtro. Lança
  /// [NoAnalyzedItemsException] se há peças mas nenhuma foi analisada.
  Future<List<Outfit>> recommend(
    List<ClothingItem> items, {
    String? occasion,
    String? weather,
    int topK = 12,
  }) async {
    final analyzed = items.where((item) => item.features != null).toList();
    if (analyzed.isEmpty) {
      if (items.isNotEmpty) throw const NoAnalyzedItemsException();
      return [];
    }

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
            'feedback': await _feedbackPayload(),
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

  /// Favoritos, rejeições e usos no formato de `Feedback.de_dict`
  /// (`model/feedback.py`). Sem histórico (Supabase fora, tabelas ainda
  /// não criadas), recomenda sem feedback em vez de falhar.
  Future<Map<String, dynamic>?> _feedbackPayload() async {
    try {
      await _history.ensureLoaded();
    } catch (_) {
      return null;
    }
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    return {
      'favoritos': _history.favorites,
      'rejeitados': [
        for (final (ids, occasion) in _history.rejections)
          {'pecas': ids, 'ocasiao': occasion},
      ],
      'usos': [
        for (final (ids, day) in _history.wornLooks)
          // Arredonda as horas: com horário de verão um dia tem 23 ou 25h.
          {'pecas': ids, 'dias': (today.difference(day).inHours / 24).round()},
      ],
    };
  }
}

/// Existem peças no guarda-roupa, mas nenhuma pôde ser analisada (API de
/// análise fora do ar): diferente de um guarda-roupa vazio.
class NoAnalyzedItemsException implements Exception {
  const NoAnalyzedItemsException();
}
