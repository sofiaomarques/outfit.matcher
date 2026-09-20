import 'package:flutter/material.dart';

/// Coração "pintado à mão", com um realce mais claro pra imitar
/// pincelada, no estilo do moodboard do app.
class PaintedHeart extends StatelessWidget {
  const PaintedHeart({
    super.key,
    required this.size,
    this.color = const Color(0xFFD8232A),
    this.rotation = 0,
  });

  final double size;
  final Color color;

  /// Rotação em radianos.
  final double rotation;

  @override
  Widget build(BuildContext context) {
    return Transform.rotate(
      angle: rotation,
      child: CustomPaint(
        size: Size.square(size),
        painter: _HeartPainter(color: color),
      ),
    );
  }
}

class _HeartPainter extends CustomPainter {
  _HeartPainter({required this.color});

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final path = _heartPath(size);
    canvas.drawPath(path, Paint()..color = color);

    final highlight = Paint()
      ..color = Colors.white.withValues(alpha: 0.25)
      ..style = PaintingStyle.stroke
      ..strokeWidth = size.width * 0.05
      ..strokeCap = StrokeCap.round;
    canvas.drawLine(
      Offset(size.width * 0.32, size.height * 0.28),
      Offset(size.width * 0.24, size.height * 0.48),
      highlight,
    );
  }

  Path _heartPath(Size size) {
    final w = size.width;
    final h = size.height;
    final path = Path()..moveTo(w * 0.5, h * 0.92);
    path.cubicTo(w * 0.05, h * 0.55, w * 0.05, h * 0.18, w * 0.28, h * 0.08);
    path.cubicTo(w * 0.42, h * 0.02, w * 0.5, h * 0.14, w * 0.5, h * 0.24);
    path.cubicTo(w * 0.5, h * 0.14, w * 0.58, h * 0.02, w * 0.72, h * 0.08);
    path.cubicTo(w * 0.95, h * 0.18, w * 0.95, h * 0.55, w * 0.5, h * 0.92);
    path.close();
    return path;
  }

  @override
  bool shouldRepaint(covariant _HeartPainter oldDelegate) =>
      oldDelegate.color != color;
}
