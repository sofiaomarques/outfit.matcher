import 'dart:typed_data';

import 'package:http/http.dart' as http;

import 'api_config.dart';

/// Cliente da API Python que roda o pipeline de `features/*.py`
/// (`api/main.py`). Hoje só usado pra recortar a peça da foto — o resto do
/// pipeline (cor/categoria/embedding automáticos) ainda é preenchido à mão
/// pelo usuário no formulário.
class GarmentAnalysisService {
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
