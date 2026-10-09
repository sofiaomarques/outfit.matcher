import 'dart:async';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import 'api_config.dart';

/// Em que pé está a API, do ponto de vista do app.
enum ApiState {
  /// Ainda não falou com a API.
  unknown,

  /// Conferindo o `/health`; ainda não demorou o bastante pra avisar.
  checking,

  /// A API não respondeu de primeira: está subindo depois de ficar parada
  /// (cold start), o que leva até ~2 min.
  waking,

  ready,

  /// Desistiu de esperar; o próximo pedido tenta de novo.
  down,
}

enum ApiProblem {
  /// Nem chegou resposta: sem internet (ou a API fora do endereço).
  offline,

  /// Respondeu, mas não acordou dentro do prazo.
  notWaking,

  /// Erro do servidor (5xx) ou pedido que estourou o tempo.
  server,
}

/// Falha ao falar com a API, com a mensagem pra mostrar na tela.
class ApiException implements Exception {
  const ApiException(this.problem, [this.statusCode]);

  final ApiProblem problem;
  final int? statusCode;

  String get message => switch (problem) {
    ApiProblem.offline =>
      'Sem conexão com o servidor. Confira sua internet e tente de novo.',
    ApiProblem.notWaking =>
      'O servidor não respondeu. Tente de novo em alguns minutos.',
    ApiProblem.server =>
      'O servidor teve um problema. Tente de novo em instantes.',
  };

  @override
  String toString() =>
      'ApiException($problem${statusCode == null ? '' : ', $statusCode'})';
}

/// Acompanha se a API está acordada. Em produção ela desliga quando fica sem
/// uso, e o primeiro pedido depois disso espera o container subir e carregar
/// os modelos (~1–2 min) — mais que o timeout de qualquer chamada. Por isso
/// os serviços passam por [send], que antes espera o `/health` responder
/// (com retry e backoff, por até [wakeDeadline]), e as telas mostram
/// "acordando" em vez de erro enquanto [isWaking].
class ApiStatus extends ChangeNotifier {
  ApiStatus({
    http.Client? client,
    String baseUrl = ApiConfig.baseUrl,
    this.wakeDeadline = const Duration(minutes: 3),
    this.freshFor = const Duration(minutes: 2),
    this.wakingAfter = const Duration(seconds: 3),
    this.attemptTimeout = const Duration(seconds: 20),
    this.maxNetworkErrors = 3,
    Duration Function(int attempt)? backoff,
  }) : _client = client ?? http.Client(),
       _health = Uri.parse('$baseUrl/health'),
       _backoff = backoff ?? _defaultBackoff;

  static final instance = ApiStatus();

  static const wakingMessage =
      'Acordando o servidor, pode levar até 2 minutos…';

  final http.Client _client;
  final Uri _health;
  final Duration Function(int attempt) _backoff;

  /// Quanto tempo esperar a API acordar antes de desistir.
  final Duration wakeDeadline;

  /// Depois desse tempo sem falar com a API, confere o `/health` de novo
  /// antes do próximo pedido: ela pode ter voltado a dormir.
  final Duration freshFor;

  /// Um `/health` mais lento que isso já conta como "acordando" na tela;
  /// antes, a conferência rápida de uma API acordada não pisca o aviso.
  final Duration wakingAfter;

  final Duration attemptTimeout;

  /// Falhas de rede seguidas (sem resposta nenhuma) até concluir que está
  /// sem internet. Acordando, a API responde (502–504) ou segura o pedido,
  /// então isso não é cold start.
  final int maxNetworkErrors;

  static Duration _defaultBackoff(int attempt) =>
      Duration(seconds: min(1 << attempt, 10));

  ApiState _state = ApiState.unknown;
  ApiState get state => _state;
  bool get isWaking => _state == ApiState.waking;

  DateTime? _lastContact;
  Future<void>? _pending;

  void _setState(ApiState state) {
    if (_state == state) return;
    _state = state;
    notifyListeners();
  }

  /// Termina quando a API está pronta, ou lança [ApiException]. Várias
  /// telas chamando ao mesmo tempo compartilham a mesma espera.
  Future<void> ensureReady() {
    final last = _lastContact;
    if (_state == ApiState.ready &&
        last != null &&
        DateTime.now().difference(last) < freshFor) {
      return Future.value();
    }
    return _pending ??= _wake().whenComplete(() => _pending = null);
  }

  Future<void> _wake() async {
    _setState(ApiState.checking);
    final wakingTimer = Timer(wakingAfter, () {
      if (_state == ApiState.checking) _setState(ApiState.waking);
    });
    final deadline = DateTime.now().add(wakeDeadline);
    var networkErrors = 0;
    try {
      for (var attempt = 0; ; attempt++) {
        try {
          final response = await _client.get(_health).timeout(attemptTimeout);
          if (response.statusCode == 200) {
            _markContact();
            return;
          }
          // 502–504: o proxy na frente da API ainda espera ela subir.
          if (response.statusCode < 502 || response.statusCode > 504) {
            throw ApiException(ApiProblem.server, response.statusCode);
          }
          networkErrors = 0;
          _setState(ApiState.waking);
        } on TimeoutException {
          networkErrors = 0;
          _setState(ApiState.waking);
        } on http.ClientException {
          if (++networkErrors >= maxNetworkErrors) {
            throw const ApiException(ApiProblem.offline);
          }
        }
        final wait = _backoff(attempt);
        if (DateTime.now().add(wait).isAfter(deadline)) {
          throw const ApiException(ApiProblem.notWaking);
        }
        await Future<void>.delayed(wait);
      }
    } catch (_) {
      _setState(ApiState.down);
      rethrow;
    } finally {
      wakingTimer.cancel();
    }
  }

  void _markContact() {
    _lastContact = DateTime.now();
    _setState(ApiState.ready);
  }

  /// Espera a API acordar ([ensureReady]) e faz o pedido. Falha de rede,
  /// timeout e 5xx viram [ApiException] (e o próximo pedido confere o
  /// `/health` de novo); outros status voltam pra quem chamou tratar.
  Future<R> send<R extends http.BaseResponse>(
    Future<R> Function() request,
  ) async {
    await ensureReady();
    final R response;
    try {
      response = await request();
    } on TimeoutException {
      _lastContact = null;
      throw const ApiException(ApiProblem.server);
    } on http.ClientException {
      _lastContact = null;
      throw const ApiException(ApiProblem.offline);
    }
    if (response.statusCode >= 500) {
      _lastContact = null;
      throw ApiException(ApiProblem.server, response.statusCode);
    }
    _markContact();
    return response;
  }
}
