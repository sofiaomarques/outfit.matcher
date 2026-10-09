import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:outfit_matcher/services/api_status.dart';

/// `/health` que responde a sequência dada (status, ou exceção), repetindo
/// a última; guarda quantas vezes foi chamado e os estados por onde passou.
class _Harness {
  _Harness(
    List<Object> replies, {
    Duration delay = Duration.zero,
    Duration wakeDeadline = const Duration(seconds: 5),
    Duration freshFor = const Duration(minutes: 2),
    Duration wakingAfter = const Duration(seconds: 3),
  }) {
    api = ApiStatus(
      client: MockClient((request) async {
        expect(request.url.path, '/health');
        final reply =
            replies[calls < replies.length ? calls : replies.length - 1];
        calls++;
        await Future<void>.delayed(delay);
        if (reply is Exception) throw reply;
        return http.Response('{}', reply as int);
      }),
      baseUrl: 'http://api.test',
      wakeDeadline: wakeDeadline,
      freshFor: freshFor,
      wakingAfter: wakingAfter,
      backoff: (_) => const Duration(milliseconds: 5),
    );
    api.addListener(() => states.add(api.state));
  }

  late final ApiStatus api;
  var calls = 0;
  final states = <ApiState>[];
}

final _offline = http.ClientException('Failed to fetch');

void main() {
  test('API acordada: pronta de primeira, sem avisar "acordando"', () async {
    final h = _Harness([200]);
    await h.api.ensureReady();
    expect(h.api.state, ApiState.ready);
    expect(h.states, [ApiState.checking, ApiState.ready]);
    expect(h.calls, 1);
  });

  test('502–504 enquanto sobe: avisa "acordando" e espera', () async {
    final h = _Harness([503, 502, 504, 200]);
    await h.api.ensureReady();
    expect(h.states, [ApiState.checking, ApiState.waking, ApiState.ready]);
    expect(h.calls, 4);
  });

  test('timeout do /health conta como acordando, não como erro', () async {
    final h = _Harness([TimeoutException('lento'), 200]);
    await h.api.ensureReady();
    expect(h.states, contains(ApiState.waking));
    expect(h.api.state, ApiState.ready);
  });

  test('/health lento além de wakingAfter avisa "acordando"', () async {
    final h = _Harness(
      [200],
      delay: const Duration(milliseconds: 50),
      wakingAfter: const Duration(milliseconds: 10),
    );
    await h.api.ensureReady();
    expect(h.states, [ApiState.checking, ApiState.waking, ApiState.ready]);
  });

  test('sem resposta nenhuma várias vezes: sem internet', () async {
    final h = _Harness([_offline]);
    await expectLater(
      h.api.ensureReady(),
      throwsA(
        isA<ApiException>().having(
          (e) => e.problem,
          'problem',
          ApiProblem.offline,
        ),
      ),
    );
    expect(h.calls, 3);
    expect(h.api.state, ApiState.down);
    expect(h.states, isNot(contains(ApiState.waking)));
  });

  test('falha de rede isolada não é "sem internet"', () async {
    final h = _Harness([_offline, 503, _offline, 200]);
    await h.api.ensureReady();
    expect(h.api.state, ApiState.ready);
  });

  test('não acorda dentro do prazo: desiste', () async {
    final h = _Harness([503], wakeDeadline: const Duration(milliseconds: 40));
    await expectLater(
      h.api.ensureReady(),
      throwsA(
        isA<ApiException>().having(
          (e) => e.problem,
          'problem',
          ApiProblem.notWaking,
        ),
      ),
    );
    expect(h.api.state, ApiState.down);
  });

  test('500 no /health é erro do servidor, sem ficar esperando', () async {
    final h = _Harness([500]);
    await expectLater(
      h.api.ensureReady(),
      throwsA(
        isA<ApiException>()
            .having((e) => e.problem, 'problem', ApiProblem.server)
            .having((e) => e.statusCode, 'statusCode', 500),
      ),
    );
    expect(h.calls, 1);
  });

  test('depois de desistir, o próximo pedido tenta de novo', () async {
    final h = _Harness([500, 200]);
    await expectLater(h.api.ensureReady(), throwsA(isA<ApiException>()));
    await h.api.ensureReady();
    expect(h.api.state, ApiState.ready);
  });

  test('telas chamando juntas compartilham a mesma espera', () async {
    final h = _Harness([503, 200]);
    await Future.wait([h.api.ensureReady(), h.api.ensureReady()]);
    expect(h.calls, 2);
  });

  test('pronta há pouco: não confere o /health de novo', () async {
    final h = _Harness([200]);
    await h.api.ensureReady();
    await h.api.ensureReady();
    expect(h.calls, 1);
  });

  test('pronta há muito tempo: confere de novo (pode ter dormido)', () async {
    final h = _Harness([200], freshFor: Duration.zero);
    await h.api.ensureReady();
    await h.api.ensureReady();
    expect(h.calls, 2);
  });

  group('send', () {
    test('espera acordar e devolve a resposta', () async {
      final h = _Harness([503, 200]);
      final response = await h.api.send(() async => http.Response('ok', 200));
      expect(response.body, 'ok');
      expect(h.api.state, ApiState.ready);
    });

    test('4xx volta pra quem chamou tratar', () async {
      final h = _Harness([200]);
      final response = await h.api.send(() async => http.Response('', 413));
      expect(response.statusCode, 413);
    });

    test('5xx vira erro do servidor e o próximo pedido reconfere', () async {
      final h = _Harness([200]);
      await expectLater(
        h.api.send(() async => http.Response('', 503)),
        throwsA(
          isA<ApiException>().having((e) => e.statusCode, 'statusCode', 503),
        ),
      );
      await h.api.send(() async => http.Response('', 200));
      expect(h.calls, 2);
    });

    test('falha de rede vira "sem internet"', () async {
      final h = _Harness([200]);
      await expectLater(
        h.api.send<http.Response>(() async => throw _offline),
        throwsA(
          isA<ApiException>().having(
            (e) => e.problem,
            'problem',
            ApiProblem.offline,
          ),
        ),
      );
    });

    test('pedido que estoura o tempo vira erro do servidor', () async {
      final h = _Harness([200]);
      await expectLater(
        h.api.send<http.Response>(() async => throw TimeoutException('90 s')),
        throwsA(
          isA<ApiException>().having(
            (e) => e.problem,
            'problem',
            ApiProblem.server,
          ),
        ),
      );
    });

    test('sem API, não chega a fazer o pedido', () async {
      final h = _Harness([_offline]);
      var sent = false;
      await expectLater(
        h.api.send(() async {
          sent = true;
          return http.Response('', 200);
        }),
        throwsA(isA<ApiException>()),
      );
      expect(sent, isFalse);
    });
  });
}
