import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'star_shape.dart';

/// Estrela preenchida com estampa de oncinha e contorno rosa, no estilo
/// do moodboard do app (adesivo "scrapbook").
class LeopardStar extends StatelessWidget {
  const LeopardStar({
    super.key,
    required this.size,
    this.baseColor = const Color(0xFFD9B98A),
    this.spotColor = const Color(0xFF3D2413),
    this.outlineColor = const Color(0xFFE85D9C),
    this.outlineWidth = 5,
    this.rotation = 0,
  });

  final double size;
  final Color baseColor;
  final Color spotColor;
  final Color outlineColor;
  final double outlineWidth;

  /// Rotação em radianos.
  final double rotation;

  @override
  Widget build(BuildContext context) {
    return Transform.rotate(
      angle: rotation,
      child: CustomPaint(
        size: Size.square(size),
        painter: _LeopardStarPainter(
          baseColor: baseColor,
          spotColor: spotColor,
          outlineColor: outlineColor,
          outlineWidth: outlineWidth,
        ),
      ),
    );
  }
}

class _LeopardStarPainter extends CustomPainter {
  _LeopardStarPainter({
    required this.baseColor,
    required this.spotColor,
    required this.outlineColor,
    required this.outlineWidth,
  });

  final Color baseColor;
  final Color spotColor;
  final Color outlineColor;
  final double outlineWidth;

  @override
  void paint(Canvas canvas, Size size) {
    final path = buildStarPath(size);

    canvas.save();
    canvas.clipPath(path);
    canvas.drawRect(Offset.zero & size, Paint()..color = baseColor);
    _paintSpots(canvas, size);
    canvas.restore();

    canvas.drawPath(
      path,
      Paint()
        ..color = outlineColor
        ..style = PaintingStyle.stroke
        ..strokeWidth = outlineWidth
        ..strokeJoin = StrokeJoin.round,
    );
  }

  /// Manchas irregulares (3-4 lóbulos cada) espalhadas em grade, imitando
  /// estampa de oncinha sem depender de uma imagem externa.
  void _paintSpots(Canvas canvas, Size size) {
    final random = math.Random(7);
    final spotPaint = Paint()..color = spotColor;
    const step = 0.24;

    for (double gx = -0.1; gx <= 1.1; gx += step) {
      for (double gy = -0.1; gy <= 1.1; gy += step) {
        final jitterX = (random.nextDouble() - 0.5) * step * 0.8;
        final jitterY = (random.nextDouble() - 0.5) * step * 0.8;
        final center = Offset(
          (gx + jitterX) * size.width,
          (gy + jitterY) * size.height,
        );
        final radius = size.width * (0.05 + random.nextDouble() * 0.045);
        _drawBlotch(canvas, spotPaint, center, radius, random);
      }
    }
  }

  void _drawBlotch(
    Canvas canvas,
    Paint paint,
    Offset center,
    double radius,
    math.Random random,
  ) {
    final lobes = 3 + random.nextInt(2);
    final path = Path();
    for (var i = 0; i < lobes; i++) {
      final angle = (2 * math.pi / lobes) * i;
      final lobeRadius = radius * (0.7 + random.nextDouble() * 0.6);
      final offset = Offset(
        center.dx + lobeRadius * math.cos(angle),
        center.dy + lobeRadius * math.sin(angle),
      );
      path.addOval(
        Rect.fromCircle(center: offset, radius: radius * 0.65),
      );
    }
    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant _LeopardStarPainter oldDelegate) => false;
}
