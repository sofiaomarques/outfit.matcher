import 'package:flutter/material.dart';

/// Fundo em padrão xadrez (gingham) usado na hero section, como no mockup.
class GinghamBackground extends StatelessWidget {
  const GinghamBackground({
    super.key,
    required this.child,
    this.squareSize = 28,
    this.baseColor = const Color(0xFFFDF6EC),
    this.lineColor = const Color(0xFFF3B8CE),
  });

  final Widget child;
  final double squareSize;
  final Color baseColor;
  final Color lineColor;

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: _GinghamPainter(
        squareSize: squareSize,
        baseColor: baseColor,
        lineColor: lineColor,
      ),
      child: child,
    );
  }
}

class _GinghamPainter extends CustomPainter {
  _GinghamPainter({
    required this.squareSize,
    required this.baseColor,
    required this.lineColor,
  });

  final double squareSize;
  final Color baseColor;
  final Color lineColor;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(Offset.zero & size, Paint()..color = baseColor);

    final stripe = Paint()..color = lineColor.withValues(alpha: 0.35);
    for (double x = 0; x < size.width; x += squareSize * 2) {
      canvas.drawRect(Rect.fromLTWH(x, 0, squareSize, size.height), stripe);
    }
    for (double y = 0; y < size.height; y += squareSize * 2) {
      canvas.drawRect(Rect.fromLTWH(0, y, size.width, squareSize), stripe);
    }
  }

  @override
  bool shouldRepaint(covariant _GinghamPainter oldDelegate) {
    return oldDelegate.squareSize != squareSize ||
        oldDelegate.baseColor != baseColor ||
        oldDelegate.lineColor != lineColor;
  }
}
