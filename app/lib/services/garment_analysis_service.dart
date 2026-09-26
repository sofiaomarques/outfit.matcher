import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;

import 'api_config.dart';

/// Cliente da API Python que roda o pipeline de `features/*.py`
/// (`api/main.py`): recorta a peça da foto e extrai as features (cor,
/// categoria, estampa, formalidade e o embedding usado pelo recomendador).
class GarmentAnalysisService {
  /// Roda o pipeline completo sobre a foto (`/items/analyze`) e devolve o
  /// JSON cru, que vai direto pra coluna `features` de `clothing_items`.
  /// Mais lento que o recorte (CLIP + segmentação): pode levar vários
  /// segundos por peça na CPU.
  Future<Map<String, dynamic>> analisarPeca(Uint8List imageBytes) async {
    final request = http.MultipartRequest(
      'POST',
      Uri.parse('${ApiConfig.baseUrl}/items/analyze'),
    )..files.add(
      http.MultipartFile.fromBytes('file', imageBytes, filename: 'foto.jpg'),
    );

    final streamedResponse = await request.send().timeout(
      const Duration(seconds: 90),
    );
    if (streamedResponse.statusCode != 200) {
      throw Exception(
        'Falha ao analisar a peça (${streamedResponse.statusCode})',
      );
    }
    final response = await http.Response.fromStream(streamedResponse);
    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  /// Recorta a peça de roupa da foto, removendo corpo/fundo, e devolve um
  /// PNG com fundo transparente. Lança se o serviço não estiver acessível —
  /// quem chama decide o fallback (normalmente: manter a foto original).
  Future<Uint8List> recortarPeca(Uint8List imageBytes) async {
    final request = http.MultipartRequest(
      'POST',
      Uri.parse('${ApiConfig.baseUrl}/items/crop'),
    )..files.add(
      http.MultipartFile.fromBytes('file', imageBytes, filename: 'foto.jpg'),
    );

    final streamedResponse = await request.send().timeout(
      const Duration(seconds: 30),
    );
    if (streamedResponse.statusCode != 200) {
      throw Exception(
        'Falha ao recortar a peça (${streamedResponse.statusCode})',
      );
    }
    final response = await http.Response.fromStream(streamedResponse);
    return response.bodyBytes;
  }
}
