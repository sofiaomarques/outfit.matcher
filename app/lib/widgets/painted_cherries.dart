import 'package:flutter/material.dart';

/// Cerejinhas decorativas, no estilo do moodboard do app.
class PaintedCherries extends StatelessWidget {
  const PaintedCherries({
    super.key,
    required this.size,
    this.color = const Color(0xFFC81E2C),
    this.stemColor = const Color(0xFF7A1836),
    this.rotation = 0,
  });

  final double size;
  final Color color;
  final Color stemColor;

  /// Rotação em radianos.
  final double rotation;

  @override
  Widget build(BuildContext context) {
    return Transform.rotate(
      angle: rotation,
      child: CustomPaint(
        size: Size.square(size),
        painter: _CherriesPainter(color: color, stemColor: stemColor),
      ),
    );
  }
}

class _CherriesPainter extends CustomPainter {
  _CherriesPainter({required this.color, required this.stemColor});

  final Color color;
  final Color stemColor;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;

    final stemPaint = Paint()
      ..color = stemColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = w * 0.045
      ..strokeCap = StrokeCap.round;

    final leftStem = Path()
      ..moveTo(w * 0.5, h * 0.08)
      ..quadraticBezierTo(w * 0.3, h * 0.05, w * 0.28, h * 0.42);
    final rightStem = Path()
      ..moveTo(w * 0.5, h * 0.08)
      ..quadraticBezierTo(w * 0.68, h * 0.12, w * 0.72, h * 0.42);
    canvas.drawPath(leftStem, stemPaint);
    canvas.drawPath(rightStem, stemPaint);

    final fruitPaint = Paint()..color = color;
    final highlightPaint = Paint()
      ..color = Colors.white.withValues(alpha: 0.35);
    final leftCenter = Offset(w * 0.28, h * 0.68);
    final rightCenter = Offset(w * 0.72, h * 0.68);
    final radius = w * 0.26;

    canvas.drawCircle(leftCenter, radius, fruitPaint);
    canvas.drawCircle(rightCenter, radius, fruitPaint);
    canvas.drawCircle(
      leftCenter.translate(-radius * 0.3, -radius * 0.3),
      radius * 0.22,
      highlightPaint,
    );
    canvas.drawCircle(
      rightCenter.translate(-radius * 0.3, -radius * 0.3),
      radius * 0.22,
      highlightPaint,
    );
  }

  @override
  bool shouldRepaint(covariant _CherriesPainter oldDelegate) =>
      oldDelegate.color != color || oldDelegate.stemColor != stemColor;
}
