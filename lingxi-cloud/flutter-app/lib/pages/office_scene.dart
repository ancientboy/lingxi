import 'dart:math' as math;
import 'package:flutter/material.dart';

// Pre-allocated constants for performance (avoid per-frame allocations)
const Color _kMonitorGlowColor = Color.fromRGBO(66, 133, 244, 0.5);
const Color _kWhiskerColor = Color(0xFFAAAAAA);
const Color _kMouthColor = Color(0xFFC4685A);
const Color _kPencilTipColor = Color(0xFFE8B84A);
const Color _kNotebookBorderColor = Color(0xFFD4C9B8);
const Color _kSofaCushionLineColor = Color(0xFFE5E5E5);
const Color _kSofaBackrestDepthColor = Color(0xFFCCCCCC);
const Color _kSteamColor = Color.fromRGBO(180, 180, 180, 0.4);
const Color _kMugHandleColor = Color(0xFFD0D0D0);
const Color _kSofaBackrestStrokeColor = Color(0xFFD8D8D8);

// ==================== CONFIG ====================
const double worldW = 820, worldH = 870;
const double chairOffset = 75;

enum CharState { idle, typing, walking, sleeping, sitting, running, drinking }

const locCoffee = Offset(150, 218);
const locSofa = Offset(130, 657);
const locTreadmill = Offset(140, 398);

// ==================== HELPERS ====================
double _dist(double x1, double y1, double x2, double y2) =>
    math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));

Color _hex(String h) {
  final c = h.replaceAll('#', '');
  return Color(int.parse('FF$c', radix: 16));
}

double _rrand(math.Random rng, double a, double b) =>
    a + rng.nextDouble() * (b - a);

// ==================== PATHFINDING ====================
class _WP {
  final String id;
  final double x, y;
  const _WP(this.id, this.x, this.y);
}

class _WaypointGraph {
  final List<_WP> waypoints = [];
  final Map<String, List<String>> edges = {};

  void wp(String id, double x, double y) {
    waypoints.add(_WP(id, x, y));
    edges[id] = [];
  }

  void edge(String a, String b) {
    edges[a]!.add(b);
    edges[b]!.add(a);
  }

  _WP? nearest(double x, double y) {
    _WP? best;
    double bestD = double.infinity;
    for (final w in waypoints) {
      final d = _dist(x, y, w.x, w.y);
      if (d < bestD) { bestD = d; best = w; }
    }
    return best;
  }

  List<String> findPath(String fromId, String toId) {
    if (fromId == toId) return [];
    final visited = <String>{fromId};
    final queue = <List<String>>[[fromId]];
    while (queue.isNotEmpty) {
      final path = queue.removeAt(0);
      final cur = path.last;
      for (final nb in (edges[cur] ?? <String>[])) {
        if (nb == toId) return [...path.sublist(1), nb];
        if (visited.contains(nb)) continue;
        visited.add(nb);
        queue.add([...path, nb]);
      }
    }
    return [];
  }

  List<Offset> buildRoute(double x1, double y1, double x2, double y2) {
    if (_dist(x1, y1, x2, y2) < 40) return [Offset(x2, y2)];
    final from = nearest(x1, y1);
    final to = nearest(x2, y2);
    if (from == null || to == null) return [Offset(x2, y2)];
    final wpPath = findPath(from.id, to.id);
    final byId = <String, _WP>{};
    for (final w in waypoints) { byId[w.id] = w; }
    return [
      ...wpPath.map((id) => Offset(byId[id]!.x, byId[id]!.y)),
      Offset(x2, y2),
    ];
  }
}

_WaypointGraph _buildGraph() {
  final g = _WaypointGraph();
  g.wp('c0', 260, 80); g.wp('c1', 260, 185); g.wp('c2', 260, 214);
  g.wp('c3', 260, 385); g.wp('c4', 260, 414); g.wp('c5', 260, 585);
  g.wp('c6', 260, 614); g.wp('c7', 260, 785); g.wp('c8', 260, 820);
  g.edge('c0','c1'); g.edge('c1','c2'); g.edge('c2','c3'); g.edge('c3','c4');
  g.edge('c4','c5'); g.edge('c5','c6'); g.edge('c6','c7'); g.edge('c7','c8');
  g.wp('i1', 520, 185); g.wp('i2', 520, 214); g.wp('i3', 520, 385);
  g.wp('i4', 520, 414); g.wp('i5', 520, 585); g.wp('i6', 520, 614);
  g.wp('i7', 520, 785);
  g.edge('i1','i2'); g.edge('i2','i3'); g.edge('i3','i4');
  g.edge('i4','i5'); g.edge('i5','i6'); g.edge('i6','i7');
  g.wp('r1', 740, 185); g.wp('r2', 740, 385); g.wp('r3', 740, 585); g.wp('r4', 740, 785);
  g.edge('r1','r2'); g.edge('r2','r3'); g.edge('r3','r4');
  g.wp('d0', 420, 185); g.wp('d1', 620, 185); g.wp('d2', 420, 385);
  g.wp('d3', 620, 385); g.wp('d4', 420, 585); g.wp('d5', 620, 585);
  g.wp('d6', 420, 785); g.wp('d7', 620, 785);
  g.edge('d0','c1'); g.edge('c1','i1'); g.edge('i1','d1'); g.edge('d1','r1');
  g.edge('d2','c3'); g.edge('c3','i3'); g.edge('i3','d3'); g.edge('d3','r2');
  g.edge('d4','c5'); g.edge('c5','i5'); g.edge('i5','d5'); g.edge('d5','r3');
  g.edge('d6','c7'); g.edge('c7','i7'); g.edge('i7','d7'); g.edge('d7','r4');
  g.edge('c2','i2'); g.edge('c4','i4'); g.edge('c6','i6');
  g.wp('bk', 150, 218); g.edge('c0','bk'); g.edge('bk','c1');
  g.wp('tm', 140, 398); g.edge('c4','tm'); g.edge('tm','c5');
  g.wp('sf', 130, 657); g.edge('c6','sf'); g.edge('sf','c7');
  g.edge('c8','r4');
  return g;
}

final _graph = _buildGraph();

// ==================== DESK / CHARACTER DATA ====================
class _Desk { final double x, y; const _Desk(this.x, this.y); }

class OfficeChar {
  final String id;
  final String name;
  final Color scarf;
  final int deskIdx;
  final _Desk Function(int) deskAt;

  double x, y, tx, ty;
  CharState state;
  double anim = 0;
  double stateTimer;
  double speed = 2.8;
  double angle = 0;
  CharState? nextState;
  List<Offset> route = [];

  OfficeChar({
    required this.id, required this.name, required this.scarf,
    required this.deskIdx, required this.deskAt, required this.state,
    required double startX, required double startY,
  }) : x = startX, y = startY, tx = startX, ty = startY,
       stateTimer = _rrand(math.Random(), 5, 15);

  Offset get homeDesk {
    final d = deskAt(deskIdx);
    return Offset(d.x, d.y + chairOffset);
  }

  void walkTo(double tx2, double ty2, CharState? next, math.Random rng) {
    route = _graph.buildRoute(x, y, tx2, ty2);
    if (route.isNotEmpty) { final f = route.removeAt(0); tx = f.dx; ty = f.dy; }
    else { tx = tx2; ty = ty2; }
    nextState = next;
    state = CharState.walking;
    const anim = 0;
  }

  void setCharState(CharState s, math.Random rng) {
    state = s; anim = 0;
    switch (s) {
      case CharState.typing: stateTimer = _rrand(rng, 10, 20); break;
      case CharState.idle: stateTimer = _rrand(rng, 8, 15); break;
      case CharState.sleeping: case CharState.sitting:
      case CharState.running: case CharState.drinking:
        stateTimer = _rrand(rng, 12, 25); break;
      case CharState.walking: break;
    }
  }
}

// ==================== PARTICLE ====================
class _Particle {
  double x, y, vx, vy, life;
  final Color color;
  final double size;
  _Particle({required this.x, required this.y, required this.vx, required this.vy,
    required this.life, required this.color, required this.size});
}

// ==================== OFFICE CAT ====================
class _OfficeCat {
  double x = 260, y = 214, tx = 260, ty = 214;
  String state = 'wander';
  double anim = 50, speed = 1.8, baseSpeed = 1.8, timer = 5;
  double facingX = 1, facingY = 1;
  String? dreamText;
  double dreamTimer = 0;
  List<Offset> route = [];
  static const targets = [
    Offset(260,80), Offset(260,214), Offset(260,414), Offset(260,614), Offset(260,820),
    Offset(520,185), Offset(520,414), Offset(520,735), Offset(740,185),
    Offset(740,555), Offset(740,785), Offset(150,218), Offset(130,657),
  ];

  void pickTarget(math.Random rng) {
    final t = targets[rng.nextInt(targets.length)];
    route = _graph.buildRoute(x, y, t.dx, t.dy);
    if (route.isNotEmpty) { final f = route.removeAt(0); tx = f.dx; ty = f.dy; }
    else { tx = t.dx; ty = t.dy; }
    speed = rng.nextDouble() < 0.3 ? baseSpeed * 2.2 : baseSpeed;
  }

  void update(double dt, math.Random rng) {
    anim += dt;
    if (state == 'wander') {
      final d = _dist(x, y, tx, ty);
      if (d < 3) {
        if (route.isNotEmpty) { final n = route.removeAt(0); tx = n.dx; ty = n.dy; }
        else {
          timer -= dt;
          if (timer <= 0) {
            if (rng.nextDouble() < 0.35) {
              state = 'nap'; timer = _rrand(rng, 8, 20);
              const dreams = ['🐟','🧶','🐱','🐾','★','♥','🐭','💤'];
              dreamText = dreams[rng.nextInt(dreams.length)]; dreamTimer = 0;
            } else { pickTarget(rng); timer = _rrand(rng, 2, 6); }
          }
        }
      } else {
        final dx = tx - x, dy = ty - y, len = math.sqrt(dx*dx+dy*dy);
        final step = speed < len ? speed : len;
        x += dx/len*step; y += dy/len*step;
        if (dx.abs() > 0.5) facingX = dx > 0 ? 1 : -1;
        if (dy.abs() > 0.5) facingY = dy > 0 ? 1 : -1;
      }
    } else if (state == 'nap') {
      timer -= dt; dreamTimer += dt;
      if (timer <= 0) { state = 'wander'; dreamText = null; pickTarget(rng); timer = _rrand(rng, 3, 8); }
    }
  }
}

// ==================== OFFICE PAINTER ====================
class _OfficePainter extends CustomPainter {
  final List<OfficeChar> chars;
  final List<_Desk> desks;
  final List<_Particle> particles;
  final _OfficeCat cat;
  final double globalTime;
  final double scale;
  final Offset camOffset;
  final String? catPetText;

  _OfficePainter({required this.chars, required this.desks, required this.particles,
    required this.cat, required this.globalTime, required this.scale,
    required this.camOffset, this.catPetText});

  Offset w(double wx, double wy) => Offset(camOffset.dx + wx * scale, camOffset.dy + wy * scale);
  double ws(double v) => v * scale;

  RRect rr(double x, double y, double w2, double h, double r) =>
      RRect.fromRectAndRadius(Rect.fromLTWH(x, y, w2, h), Radius.circular(r));

  void shadow(Canvas c, double x, double y, double w2, double h, double a) {
    c.drawOval(Rect.fromCenter(center: Offset(x, y+2), width: w2, height: h/1.5),
        Paint()..color = Color.fromRGBO(0, 0, 0, a));
  }

  void txt(Canvas c, String text, Offset pos, double fontSize, Color color,
      {TextAlign align = TextAlign.center, FontWeight? weight, String? family}) {
    final tp = TextPainter(
      text: TextSpan(text: text, style: TextStyle(
        fontSize: fontSize, color: color, fontWeight: weight, fontFamily: family)),
      textDirection: TextDirection.ltr, textAlign: align,
    )..layout();
    final off = align == TextAlign.center
        ? Offset(pos.dx - tp.width/2, pos.dy - tp.height/2) : pos;
    tp.paint(c, off);
  }

  // ---- Zones ----
  void drawZones(Canvas c) {
    c.drawRRect(rr(w(35,135).dx, w(35,135).dy, ws(225), ws(100), ws(14)),
        Paint()..color = const Color.fromRGBO(139, 105, 20, 0.06));
    c.drawRRect(rr(w(35,375).dx, w(35,375).dy, ws(225), ws(90), ws(14)),
        Paint()..color = const Color.fromRGBO(100, 180, 100, 0.06));
    c.drawRRect(rr(w(35,618).dx, w(35,618).dy, ws(225), ws(90), ws(14)),
        Paint()..color = const Color.fromRGBO(155, 89, 182, 0.06));
    c.drawRRect(rr(w(290,20).dx, w(290,20).dy, ws(500), ws(830), ws(16)),
        Paint()..color = const Color.fromRGBO(66, 133, 244, 0.03));
  }

  void drawLabels(Canvas c) {
    final lbl = const Color.fromRGBO(0, 0, 0, 0.18);
    txt(c, 'Break Area', w(150, 195), ws(11), lbl);
    txt(c, 'Wellness Zone', w(140, 435), ws(11), lbl);
    txt(c, 'Relax Zone', w(130, 675), ws(11), lbl);
    txt(c, 'Work Zone', w(530, 420), ws(11), lbl);
  }

  // ---- Desk ----
  void drawDesk(Canvas c, double dx, double dy) {
    final p = w(dx, dy);
    final dw = ws(150), dh = ws(100), r = ws(10), sideH = ws(8);
    shadow(c, p.dx, p.dy + sideH/2, dw, dh, 0.1);
    // Right side
    c.drawPath(Path()
      ..moveTo(p.dx+dw/2, p.dy-dh/2)..lineTo(p.dx+dw/2, p.dy+dh/2)
      ..lineTo(p.dx+dw/2, p.dy+dh/2+sideH)..lineTo(p.dx-dw/2, p.dy+dh/2+sideH)
      ..lineTo(p.dx-dw/2, p.dy+dh/2)..close(), Paint()..color = const Color(0xFFE2E2E2));
    // Bottom side
    c.drawPath(Path()
      ..moveTo(p.dx-dw/2, p.dy+dh/2)..lineTo(p.dx+dw/2, p.dy+dh/2)
      ..lineTo(p.dx+dw/2, p.dy+dh/2+sideH)..lineTo(p.dx-dw/2, p.dy+dh/2+sideH)
      ..close(), Paint()..color = const Color(0xFFEBEBEB));
    // Top surface
    c.drawRRect(rr(p.dx-dw/2, p.dy-dh/2, dw, dh, r), Paint()..color = const Color(0xFFFAFAFA));
    c.drawRRect(rr(p.dx-dw/2, p.dy-dh/2, dw, dh, r),
        Paint()..color = const Color(0xFFE0E0E0)..strokeWidth = ws(1.2)..style = PaintingStyle.stroke);
    // Highlight
    c.drawLine(Offset(p.dx-dw/2+r, p.dy-dh/2+1), Offset(p.dx+dw/2-r, p.dy-dh/2+1),
        Paint()..color = const Color.fromRGBO(255,255,255,0.6)..strokeWidth = ws(1));

    final seed = (dx*7+dy*13).round() % 6;
    // Coffee mug
    final mugX = p.dx - dw*0.35, mugY = p.dy + dh*0.15;
    c.drawOval(Rect.fromCenter(center: Offset(mugX, mugY), width: ws(12), height: ws(10)),
        Paint()..color = const Color(0xFFFFFFFF));
    c.drawOval(Rect.fromCenter(center: Offset(mugX, mugY), width: ws(12), height: ws(10)),
        Paint()..color = const Color(0xFFD0D0D0)..strokeWidth = ws(0.6)..style = PaintingStyle.stroke);
    // Mug handle
    c.drawArc(Rect.fromCircle(center: Offset(mugX + ws(6), mugY), radius: ws(3)),
        -math.pi * 0.4, math.pi * 0.8, false,
        Paint()..color = _kMugHandleColor..strokeWidth = ws(0.8)..style = PaintingStyle.stroke);
    c.drawOval(Rect.fromCenter(center: Offset(mugX, mugY - ws(0.5)), width: ws(9), height: ws(7)),
        Paint()..color = const Color(0xFF8B6914));
    // Steam
    c.drawPath(Path()..moveTo(mugX, mugY - ws(6))
      ..quadraticBezierTo(mugX + ws(2), mugY - ws(9), mugX - ws(1), mugY - ws(11)),
        Paint()..color = const Color.fromRGBO(180,180,180,0.4)
          ..strokeWidth = ws(0.6)..strokeCap = StrokeCap.round..style = PaintingStyle.stroke);
    // Notebook
    if (seed % 2 == 0) {
      final nbX = p.dx + dw*0.3, nbY = p.dy + dh*0.2;
      c.drawRRect(rr(nbX-ws(10), nbY-ws(7), ws(20), ws(14), ws(1.5)),
          Paint()..color = const Color(0xFFF5F0E8));
      // Notebook border
      c.drawRRect(rr(nbX-ws(10), nbY-ws(7), ws(20), ws(14), ws(1.5)),
          Paint()..color = _kNotebookBorderColor..strokeWidth = ws(0.5)..style = PaintingStyle.stroke);
      final lp = Paint()..color = const Color(0xFFC8BFB0)..strokeWidth = ws(0.3);
      for (int i=0; i<4; i++) {
        final ly = nbY - ws(4) + ws(3)*i;
        c.drawLine(Offset(nbX-ws(7), ly), Offset(nbX+ws(7), ly), lp);
      }
    }
    // Plant
    if (seed % 3 == 0) {
      final plX = p.dx - dw*0.38, plY = p.dy - dh*0.3;
      c.drawOval(Rect.fromCenter(center: Offset(plX, plY+ws(3)), width: ws(10), height: ws(7)),
          Paint()..color = const Color(0xFFD4956A));
      c.drawCircle(Offset(plX, plY - ws(2)), ws(4), Paint()..color = const Color(0xFF5A9E5A));
      c.drawCircle(Offset(plX - ws(2), plY - ws(4)), ws(3), Paint()..color = const Color(0xFF4A8E4A));
    }
    // Sticky note
    if (seed % 2 == 1) {
      final snX = p.dx + dw*0.32, snY = p.dy - dh*0.22;
      const nc = [Color(0xFFFFF9A5), Color(0xFFA5D8FF), Color(0xFFFFA5A5), Color(0xFFA5FFA5)];
      c.save(); c.translate(snX, snY); c.rotate(0.1);
      c.drawRect(Rect.fromLTWH(-ws(6), -ws(5), ws(12), ws(10)),
          Paint()..color = nc[seed % nc.length]);
      c.restore();
    }
    // Pen
    c.drawLine(Offset(p.dx+dw*0.15, p.dy+dh*0.25), Offset(p.dx+dw*0.35, p.dy+dh*0.35),
        Paint()..color = const Color(0xFF555555)..strokeWidth = ws(1.2)..strokeCap = StrokeCap.round);
    // Pencil tip (yellow triangle)
    c.drawPath(Path()
      ..moveTo(p.dx+dw*0.35, p.dy+dh*0.35)
      ..lineTo(p.dx+dw*0.37, p.dy+dh*0.33)
      ..lineTo(p.dx+dw*0.36, p.dy+dh*0.37)
      ..close(), Paint()..color = _kPencilTipColor);
  }

  // ---- Monitor ----
  void drawMonitor(Canvas c, double mx, double my, bool active, int deskIdx) {
    final p = w(mx, my);
    final mw = ws(50), mh = ws(32), mr = ws(4), depth = ws(4);
    // Stand
    c.drawRRect(rr(p.dx-ws(14), p.dy+mh/2-ws(2)+depth, ws(28), ws(8), ws(3)),
        Paint()..color = const Color(0xFFC8C8C8));
    c.drawRect(Rect.fromLTWH(p.dx-ws(2), p.dy+mh/2, ws(4), depth),
        Paint()..color = const Color(0xFFB0B0B0));
    c.drawRRect(rr(p.dx-mw/2, p.dy-mh/2, mw, depth, mr),
        Paint()..color = const Color(0xFF333333));
    c.drawRRect(rr(p.dx-mw/2, p.dy-mh/2+depth, mw, mh, mr),
        Paint()..color = const Color(0xFF2A2A2A));
    if (active) {
      // Glow effect for active monitor
      c.save();
      c.drawRRect(rr(p.dx-mw/2+ws(3), p.dy-mh/2+depth+ws(3), mw-ws(6), mh-ws(6), mr-ws(1)),
          Paint()..color = _kMonitorGlowColor..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8));
      c.restore();
      c.drawRRect(rr(p.dx-mw/2+ws(3), p.dy-mh/2+depth+ws(3), mw-ws(6), mh-ws(6), mr-ws(1)),
          Paint()..color = const Color(0xFF4285F4));
      final lp = Paint()..color = const Color.fromRGBO(255,255,255,0.7);
      for (int i=0; i<3; i++)
        c.drawRect(Rect.fromLTWH(p.dx-mw/2+ws(8), p.dy-mh/2+depth+ws(8)+i*ws(7), ws(15), ws(2)), lp);
      // Screen content
      _drawScreen(c, p.dx, p.dy, mw, mh, depth, deskIdx);
    } else {
      c.drawRRect(rr(p.dx-mw/2+ws(3), p.dy-mh/2+depth+ws(3), mw-ws(6), mh-ws(6), mr-ws(1)),
          Paint()..color = const Color(0xFF1A1A1A));
    }
  }

  void _drawScreen(Canvas c, double px, double py, double mw, double mh, double depth, int deskIdx) {
    const types = ['code','terminal','chart','design','chat','review','deploy','docs'];
    final type = types[deskIdx % types.length];
    final sx = px - mw/2 + ws(5), sy = py - mh/2 + ws(9);
    final scrW = mw - ws(10), scrH = mh - ws(12);
    c.save(); c.clipRect(Rect.fromLTWH(sx, sy, scrW, scrH));

    if (type == 'code') {
      const lines = ['const app = express()', 'app.listen(3000)', '// TODO: fix bug', 'npm run build'];
      final scrollOff = (globalTime * 0.5).floor() % 2;
      for (int i=0; i<lines.length; i++) {
        final ly = sy + ws(6) + (i + scrollOff) * ws(6.5);
        if (ly > sy && ly < sy + scrH) {
          txt(c, lines[i], Offset(sx+ws(2), ly-ws(2)), ws(5), const Color(0xFF88FF88),
            align: TextAlign.left, family: 'monospace');
        }
      }
    } else if (type == 'terminal') {
      const lines = [r'~/project $ git push', 'Everything up-to-date', r'~/project $ npm test', '✓ 42 tests passed'];
      final scrollOff = (globalTime * 0.5).floor() % 2;
      for (int i=0; i<lines.length; i++) {
        final ly = sy + ws(6) + (i + scrollOff) * ws(6.5);
        if (ly > sy && ly < sy + scrH) {
          txt(c, lines[i], Offset(sx+ws(2), ly-ws(2)), ws(5), const Color(0xFF00FF00),
            align: TextAlign.left, family: 'monospace');
        }
      }
    } else if (type == 'chart') {
      const bars = [0.6, 0.8, 0.4, 0.9, 0.7, 0.5, 0.85];
      final barW = scrW/(bars.length*2);
      for (int i=0; i<bars.length; i++) {
        final anim = ((globalTime * 0.3 - i * 0.1) % 2).clamp(0.0, 1.0);
        final bh = scrH * bars[i] * anim * 0.8;
        c.drawRect(Rect.fromLTWH(sx+barW+i*barW*2, sy+scrH-bh, barW, bh),
            Paint()..color = HSLColor.fromAHSL(1, (140+i*20).toDouble(), 0.7, 0.55).toColor());
      }
    } else if (type == 'design') {
      c.drawRect(Rect.fromLTWH(sx+ws(2), sy+ws(2), scrW*0.4, scrH*0.3),
          Paint()..color = const Color(0xFF44AA99));
      c.drawRect(Rect.fromLTWH(sx+scrW*0.45, sy+ws(2), scrW*0.5, scrH*0.3),
          Paint()..color = const Color(0xFF4488FF));
      c.drawRect(Rect.fromLTWH(sx+ws(2), sy+scrH*0.4, scrW-ws(4), scrH*0.55),
          Paint()..color = const Color(0xFFFF8844));
    } else if (type == 'chat') {
      final cp = Paint()..color = const Color.fromRGBO(255,255,255,0.2);
      c.drawRRect(rr(sx+ws(2), sy+ws(3), scrW*0.6, ws(8), ws(2)), cp);
      c.drawRRect(rr(sx+scrW*0.3, sy+ws(14), scrW*0.65, ws(8), ws(2)), cp);
    } else if (type == 'review') {
      const dl = ['- return null;', '+ return data;', '+ // fixed!', '  ✓ tests pass'];
      for (int i=0; i<dl.length; i++) {
        final ly = sy + ws(6) + i*ws(6);
        final line = dl[i];
        if (line.startsWith('-')) c.drawRect(Rect.fromLTWH(sx, ly-ws(4), scrW, ws(6)),
            Paint()..color = const Color.fromRGBO(255,100,100,0.3));
        else if (line.startsWith('+')) c.drawRect(Rect.fromLTWH(sx, ly-ws(4), scrW, ws(6)),
            Paint()..color = const Color.fromRGBO(100,255,100,0.3));
        txt(c, line, Offset(sx+ws(2), ly-ws(3)), ws(4.5),
          line.startsWith('-') ? const Color(0xFFFAAAAA) : line.startsWith('+') ? const Color(0xFFAAFFAA) : const Color(0xFFAAAAAA),
          align: TextAlign.left, family: 'monospace');
      }
    } else if (type == 'deploy') {
      const stages = ['Build','Test','Deploy'];
      final prog = (globalTime * 0.15) % 3;
      for (int i=0; i<stages.length; i++) {
        final bx = sx + ws(2) + i*(scrW/3), bw = scrW/3 - ws(4);
        c.drawRRect(rr(bx, sy+ws(4), bw, scrH*0.4, ws(2)),
            Paint()..color = i < prog.floor() ? const Color(0xFF44AA44) : i == prog.floor() ? const Color(0xFFAAAA44) : const Color(0xFF555555));
        txt(c, stages[i], Offset(bx+bw/2, sy+ws(4)+scrH*0.2), ws(4),
          const Color(0xFFFFFFFF), weight: FontWeight.bold);
        if (i == prog.floor()) {
          c.drawArc(Rect.fromCircle(center: Offset(bx+bw/2, sy+scrH*0.7), radius: ws(4)),
            globalTime*5, math.pi*1.5, false,
            Paint()..color = const Color(0xFFFFFF00)..strokeWidth = ws(1)..style = PaintingStyle.stroke);
        } else if (i < prog.floor()) {
          txt(c, '✓', Offset(bx+bw/2, sy+scrH*0.7), ws(5), const Color(0xFFFFFFFF));
        }
      }
    } else if (type == 'docs') {
      txt(c, 'API Docs', Offset(sx+ws(2), sy+ws(4)), ws(5), const Color(0xFFDDDDDD),
        align: TextAlign.left, weight: FontWeight.bold);
      for (int i=0; i<4; i++)
        c.drawRect(Rect.fromLTWH(sx+ws(2), sy+ws(12)+i*ws(5), scrW*(0.5+(deskIdx+i)*17%10/25), ws(2)),
            Paint()..color = const Color(0xFFAAAAAA));
    }
    c.restore();
  }

  // ---- Chair ----
  void drawChair(Canvas c, double cx, double cy) {
    final p = w(cx, cy); final cr = ws(18);
    shadow(c, p.dx, p.dy+ws(3), cr*2, cr*2, 0.1);
    final legP = Paint()..color = const Color(0xFFB8B8B8)..strokeWidth = ws(1.5)..strokeCap = StrokeCap.round;
    for (int i=0; i<5; i++) {
      final a = (i/5)*math.pi*2;
      c.drawLine(p, Offset(p.dx + math.cos(a)*cr*1.2, p.dy + math.sin(a)*cr*1.2), legP);
    }
    c.drawCircle(p, ws(4), Paint()..color = const Color(0xFF999999));
    c.drawOval(Rect.fromCenter(center: p, width: cr*2, height: cr*1.6),
        Paint()..color = const Color(0xFFE8E8E8));
    c.drawOval(Rect.fromCenter(center: p, width: cr*2, height: cr*1.6),
        Paint()..color = const Color(0xFFD0D0D0)..strokeWidth = ws(0.8)..style = PaintingStyle.stroke);
    c.drawArc(Rect.fromCircle(center: Offset(p.dx, p.dy+cr*0.65), radius: cr*0.7), 0, math.pi, false,
        Paint()..color = const Color(0xFFDCDCDC));
    c.drawArc(Rect.fromCircle(center: Offset(p.dx, p.dy+cr*0.65), radius: cr*0.7), 0, math.pi, false,
        Paint()..color = const Color(0xFFC8C8C8)..strokeWidth = ws(0.6)..style = PaintingStyle.stroke);
  }

  // ---- Break Area ----
  void drawBreakArea(Canvas c) {
    const bx=60.0, by=145.0, bw=180.0, bh=55.0;
    final s = w(bx,by); final pw=ws(bw), ph=ws(bh), depth=ws(12);
    shadow(c, s.dx+pw/2, s.dy+ph/2+depth/2, pw, ph, 0.08);
    c.drawPath(Path()..moveTo(s.dx+pw,s.dy)..lineTo(s.dx+pw,s.dy+ph)..lineTo(s.dx+pw,s.dy+ph+depth)..lineTo(s.dx,s.dy+ph+depth)..lineTo(s.dx,s.dy+ph)..close(),
        Paint()..color = const Color(0xFFDDDDDD));
    c.drawPath(Path()..moveTo(s.dx,s.dy+ph)..lineTo(s.dx+pw,s.dy+ph)..lineTo(s.dx+pw,s.dy+ph+depth)..lineTo(s.dx,s.dy+ph+depth)..close(),
        Paint()..color = const Color(0xFFE8E8E8));
    c.drawRRect(rr(s.dx, s.dy, pw, ph, ws(8)), Paint()..color = const Color(0xFFF8F8F8));
    c.drawRRect(rr(s.dx, s.dy, pw, ph, ws(8)),
        Paint()..color = const Color(0xFFE2E2E2)..strokeWidth = ws(1)..style = PaintingStyle.stroke);
    c.drawLine(Offset(s.dx+ws(10), s.dy+ph+depth*0.5), Offset(s.dx+pw-ws(10), s.dy+ph+depth*0.5),
        Paint()..color = const Color(0xFFD0D0D0)..strokeWidth = ws(0.5));
    c.drawCircle(Offset(s.dx+pw/2-ws(15), s.dy+ph+depth*0.5), ws(2), Paint()..color = const Color(0xFFBBBBBB));
    c.drawCircle(Offset(s.dx+pw/2+ws(15), s.dy+ph+depth*0.5), ws(2), Paint()..color = const Color(0xFFBBBBBB));
    // Coffee machine
    final cm = w(bx+bw-40, by+bh/2); final cmw=ws(28), cmh=ws(32), cmd=ws(10);
    c.drawRect(Rect.fromLTWH(cm.dx-cmw/2+cmw, cm.dy-cmh/2, cmd, cmh), Paint()..color = const Color(0xFFAAAAAA));
    c.drawRect(Rect.fromLTWH(cm.dx-cmw/2, cm.dy-cmh/2+cmd, cmw, cmh-cmd), Paint()..color = const Color(0xFFC8C8C8));
    c.drawRRect(rr(cm.dx-cmw/2, cm.dy-cmh/2, cmw, cmd, ws(4)), Paint()..color = const Color(0xFFC8C8C8));
    c.drawRect(Rect.fromLTWH(cm.dx-ws(3), cm.dy-cmh/2+cmd+ws(2), ws(6), ws(5)), Paint()..color = const Color(0xFF999999));
    c.drawCircle(Offset(cm.dx, cm.dy-cmh/2+cmd+ws(18)), ws(3), Paint()..color = const Color(0xFFE74C3C));
    // Cups
    for (int row=0; row<2; row++) for (int col=0; col<4; col++) {
      final cp = w(bx+28+col*28, by+16+row*24);
      c.drawPath(Path()..moveTo(cp.dx+ws(3),cp.dy+ws(8))..lineTo(cp.dx+ws(3),cp.dy+ws(8)+ws(4))
        ..lineTo(cp.dx-ws(3),cp.dy+ws(8)+ws(4))..lineTo(cp.dx-ws(3),cp.dy+ws(8))..close(),
        Paint()..color = const Color(0xFF6B4F12));
      c.drawPath(Path()..moveTo(cp.dx-ws(5),cp.dy-ws(2))..lineTo(cp.dx+ws(5),cp.dy-ws(2))
        ..lineTo(cp.dx+ws(3),cp.dy+ws(8))..lineTo(cp.dx-ws(3),cp.dy+ws(8))..close(),
        Paint()..color = const Color(0xFF8B6914));
    }
  }

  // ---- Treadmill ----
  void drawTreadmill(Canvas c) {
    const tx=70.0, ty=387.0, tw=140.0, th=55.0;
    final s = w(tx,ty); final pw=ws(tw), ph=ws(th), depth=ws(10);
    shadow(c, s.dx+pw/2, s.dy+ph/2+depth/2, pw, ph, 0.08);
    c.drawPath(Path()..moveTo(s.dx+pw,s.dy+ws(8))..lineTo(s.dx+pw,s.dy+ph-ws(12))
      ..lineTo(s.dx+pw,s.dy+ph-ws(12)+depth)..lineTo(s.dx,s.dy+ph-ws(12)+depth)..lineTo(s.dx,s.dy+ph-ws(12))..close(),
        Paint()..color = const Color(0xFFDDDDDD));
    c.drawPath(Path()..moveTo(s.dx,s.dy+ph-ws(12))..lineTo(s.dx+pw,s.dy+ph-ws(12))
      ..lineTo(s.dx+pw,s.dy+ph-ws(12)+depth)..lineTo(s.dx,s.dy+ph-ws(12)+depth)..close(),
        Paint()..color = const Color(0xFFE5E5E5));
    c.drawRRect(rr(s.dx, s.dy+ws(8), pw, ph-ws(12), ws(6)), Paint()..color = const Color(0xFFFAFAFA));
    c.drawRRect(rr(s.dx, s.dy+ws(8), pw, ph-ws(12), ws(6)),
        Paint()..color = const Color(0xFFE5E5E5)..strokeWidth = ws(1)..style = PaintingStyle.stroke);
    c.drawRRect(rr(s.dx+ws(8), s.dy+ws(14), pw-ws(16), ph-ws(24), ws(3)), Paint()..color = const Color(0xFF555555));
    for (double i=tx+16; i<tx+tw-16; i+=10) {
      final lp = w(i, ty);
      c.drawLine(Offset(lp.dx, s.dy+ws(16)), Offset(lp.dx, s.dy+ph-ws(16)),
          Paint()..color = const Color(0xFF444444)..strokeWidth = ws(0.5));
    }
    final postP = Paint()..color = const Color(0xFFBBBBBB)..strokeWidth = ws(3)..strokeCap = StrokeCap.round;
    c.drawLine(w(tx+15,ty+8), w(tx+15,ty-15), postP);
    c.drawLine(w(tx+tw-15,ty+8), w(tx+tw-15,ty-15), postP);
    c.drawLine(w(tx+15,ty-15), w(tx+tw-15,ty-15), postP);
    final pc = w(tx+tw/2, ty-10);
    c.drawRRect(rr(pc.dx-ws(10), pc.dy-ws(4), ws(20), ws(8), ws(3)), Paint()..color = const Color(0xFF555555));
    c.drawCircle(Offset(pc.dx, pc.dy-ws(1)), ws(2), Paint()..color = const Color(0xFF2ECC71));
  }

  // ---- Sofa ----
  void drawSofa(Canvas c) {
    const sx2=70.0, sy2=630.0, sw2=120.0, sh2=55.0;
    final st = w(sx2,sy2); final pw=ws(sw2), ph=ws(sh2), depth=ws(14);
    shadow(c, st.dx+pw/2, st.dy+ph/2+depth/2, pw, ph, 0.1);
    c.drawPath(Path()..moveTo(st.dx+pw,st.dy)..lineTo(st.dx+pw,st.dy+ph)..lineTo(st.dx+pw,st.dy+ph+depth)
      ..lineTo(st.dx,st.dy+ph+depth)..lineTo(st.dx,st.dy+ph)..close(), Paint()..color = const Color(0xFFD5D5D5));
    c.drawPath(Path()..moveTo(st.dx,st.dy+ph)..lineTo(st.dx+pw,st.dy+ph)..lineTo(st.dx+pw,st.dy+ph+depth)
      ..lineTo(st.dx,st.dy+ph+depth)..close(), Paint()..color = const Color(0xFFDDDDDD));
    c.drawRRect(rr(st.dx, st.dy, pw, ph, ws(10)), Paint()..color = const Color(0xFFF5F5F5));
    c.drawRRect(rr(st.dx, st.dy, pw, ph, ws(10)),
        Paint()..color = const Color(0xFFE0E0E0)..strokeWidth = ws(1)..style = PaintingStyle.stroke);
    c.drawRRect(rr(st.dx+ws(5), st.dy-ws(2), pw-ws(10), ws(18), ws(6)), Paint()..color = const Color(0xFFEBEBEB));
    c.drawRRect(rr(st.dx+ws(5), st.dy-ws(2), pw-ws(10), ws(18), ws(6)),
        Paint()..color = _kSofaBackrestStrokeColor..strokeWidth = ws(0.8)..style = PaintingStyle.stroke);
    // Backrest depth (right side)
    c.drawPath(Path()
      ..moveTo(st.dx+pw-ws(5), st.dy-ws(2))
      ..lineTo(st.dx+pw-ws(5), st.dy-ws(2)+ws(18))
      ..lineTo(st.dx+pw-ws(5)+ws(4), st.dy-ws(2)+ws(18)+ws(3))
      ..lineTo(st.dx+pw-ws(5)+ws(4), st.dy-ws(2)+ws(3))
      ..close(), Paint()..color = _kSofaBackrestDepthColor);
    c.drawRRect(rr(st.dx-ws(5), st.dy+ws(8), ws(12), ph-ws(20), ws(5)), Paint()..color = const Color(0xFFEAEAEA));
    c.drawRRect(rr(st.dx+pw-ws(7), st.dy+ws(8), ws(12), ph-ws(20), ws(5)), Paint()..color = const Color(0xFFEAEAEA));
    // Cushion center divider line
    c.drawLine(Offset(st.dx+pw/2, st.dy+ws(15)), Offset(st.dx+pw/2, st.dy+ph-ws(10)),
        Paint()..color = _kSofaCushionLineColor..strokeWidth = ws(0.5));
    // Side table
    final tp = w(sx2+sw2+18, sy2+sh2/2);
    c.drawRect(Rect.fromLTWH(tp.dx-ws(12), tp.dy-ws(12)+ws(8), ws(24)+ws(3), ws(8)), Paint()..color = const Color(0xFFDDDDDD));
    c.drawRRect(rr(tp.dx-ws(12), tp.dy-ws(12), ws(24), ws(24), ws(5)), Paint()..color = const Color(0xFFF8F8F8));
  }

  // ---- Nameplate ----
  void drawNameplate(Canvas c, _Desk d, String name, Color scarfColor) {
    final dp = w(d.x, d.y); final dw2 = ws(150), dh = ws(100);
    final npW=ws(36), npH=ws(12);
    final npX = dp.dx + dw2/2 - ws(6) - npW/2;
    final npY = dp.dy - dh/2 + ws(6) + npH/2;
    c.drawRRect(rr(npX-npW/2, npY-npH/2, npW, npH, ws(2.5)), Paint()..color = const Color(0xFFFFFFFF));
    c.drawRRect(rr(npX-npW/2, npY-npH/2, npW, npH, ws(2.5)),
        Paint()..color = const Color(0xFFE0E0E0)..strokeWidth = ws(0.5)..style = PaintingStyle.stroke);
    c.drawRect(Rect.fromLTWH(npX+npW/2-ws(2.5), npY-npH/2, ws(2.5), npH), Paint()..color = scarfColor);
    txt(c, name, Offset(npX - ws(1), npY), ws(7), const Color(0xFF333333), weight: FontWeight.w600);
  }

  // ---- Character ----
  void drawChar(Canvas c, OfficeChar ch) {
    final p = w(ch.x, ch.y);
    double bodySY = 1.0, oxBase = 0, oyBase = 0;
    String footMode = 'normal', facing = 'front';
    switch (ch.state) {
      case CharState.idle: bodySY=1; footMode='normal'; facing='front'; break;
      case CharState.typing: bodySY=0.92; oyBase=-2; footMode='tucked'; facing='back'; break;
      case CharState.walking: footMode='walk'; facing='front'; break;
      case CharState.sitting: bodySY=0.55; oxBase=4; oyBase=8; footMode='forward'; facing='front'; break;
      case CharState.sleeping: bodySY=0.55; oxBase=-6; footMode='tucked'; facing='front'; break;
      case CharState.running: bodySY=0.9; footMode='run'; facing='front'; break;
      case CharState.drinking: bodySY=0.95; footMode='normal'; facing='front'; break;
    }
    if (ch.state == CharState.walking && ch.ty - ch.y < -1) facing = 'back';
    double ox = oxBase * scale, oy = oyBase * scale;
    switch (ch.state) {
      case CharState.idle: oy += math.sin(ch.anim*3)*2*scale; ox += math.sin(ch.anim*2)*scale; break;
      case CharState.walking: oy += math.sin(ch.anim*10).abs()*2.5*scale; break;
      case CharState.sleeping: oy += math.sin(ch.anim*1.5)*1.5*scale; break;
      case CharState.running: oy += math.sin(ch.anim*14).abs()*4*scale; break;
      case CharState.drinking: oy += math.sin(ch.anim*2)*scale; break;
      default: break;
    }
    c.save(); c.translate(p.dx + ox, p.dy + oy);
    final s = scale * 1.5;
    final dx = ch.tx - ch.x, dy2 = ch.ty - ch.y;
    final isVert = dy2.abs() > dx.abs();
    final wc = ch.anim*10, rc = footMode=='run' ? ch.anim*14 : 0.0;
    final lsY = footMode=='walk'&&isVert ? math.sin(wc)*5*s : 0.0;
    final lsX = footMode=='walk'&&!isVert ? math.sin(wc)*5*s : 0.0;
    final lb = footMode=='walk' ? math.sin(wc).abs()*1.5*s : 0.0;
    final rsY = footMode=='run'&&isVert ? math.sin(rc)*7*s : 0.0;
    final rsX = footMode=='run'&&!isVert ? math.sin(rc)*7*s : 0.0;
    final rb = footMode=='run' ? math.sin(rc).abs()*3*s : 0.0;

    final black = Paint()..color = const Color(0xFF1A1A1A);
    // Feet
    if (footMode == 'forward') {
      c.drawOval(Rect.fromCenter(center: Offset(10*s,10*s), width: 12*s, height: 7*s), black);
      c.drawOval(Rect.fromCenter(center: Offset(14*s,15*s), width: 12*s, height: 7*s), black);
    } else if (footMode == 'tucked') {
      c.drawOval(Rect.fromCenter(center: Offset(-4*s,14*s), width: 8*s, height: 5*s), black);
      c.drawOval(Rect.fromCenter(center: Offset(4*s,14*s), width: 8*s, height: 5*s), black);
    } else if (footMode == 'walk') {
      c.drawOval(Rect.fromCenter(center: Offset(-5*s+lsX,15*s+lsY-lb), width: 10*s, height: 7*s), black);
      c.drawOval(Rect.fromCenter(center: Offset(5*s-lsX,15*s-lsY-lb), width: 10*s, height: 7*s), black);
    } else if (footMode == 'run') {
      c.drawOval(Rect.fromCenter(center: Offset(-5*s+rsX,15*s+rsY-rb), width: 11*s, height: 7*s), black);
      c.drawOval(Rect.fromCenter(center: Offset(5*s-rsX,15*s-rsY-rb), width: 11*s, height: 7*s), black);
    } else {
      c.drawOval(Rect.fromCenter(center: Offset(-5*s,15*s), width: 10*s, height: 6*s), black);
      c.drawOval(Rect.fromCenter(center: Offset(5*s,15*s), width: 10*s, height: 6*s), black);
    }
    // Body
    c.drawPath(Path()
      ..moveTo(0, -20*s)
      ..cubicTo(-16*s,-20*s, -16*s,-4*s, -14*s, 8*s*bodySY)
      ..quadraticBezierTo(0, 20*s*bodySY, 14*s, 8*s*bodySY)
      ..cubicTo(16*s, -4*s, 16*s, -20*s, 0, -20*s)
      ..close(), black);
    // Scarf
    c.drawOval(Rect.fromCenter(center: Offset(0, -4*s), width: 26*s, height: 7*s), Paint()..color = ch.scarf);
    // Tail
    if (facing != 'back') {
      c.drawPath(Path()
        ..moveTo(-8*s,-2*s)..quadraticBezierTo(-12*s,4*s,-10*s,8*s)
        ..lineTo(-7*s,6*s)..quadraticBezierTo(-9*s,2*s,-5*s,-1*s)..close(), Paint()..color = ch.scarf);
    }
    // Arms
    if (facing == 'back') {
      c.drawOval(Rect.fromCenter(center: Offset(-13*s,2*s), width: 8*s, height: 6*s), black);
      c.drawOval(Rect.fromCenter(center: Offset(13*s,2*s), width: 8*s, height: 6*s), black);
    } else if (footMode == 'forward') {
      c.drawOval(Rect.fromCenter(center: Offset(8*s,4*s), width: 10*s, height: 7*s), black);
      c.drawOval(Rect.fromCenter(center: Offset(10*s,8*s), width: 10*s, height: 7*s), black);
    } else if (footMode == 'run') {
      c.drawOval(Rect.fromCenter(center: Offset(-13*s,-2*s-rsX*0.5), width: 10*s, height: 8*s), black);
      c.drawOval(Rect.fromCenter(center: Offset(13*s,-2*s+rsX*0.5), width: 10*s, height: 8*s), black);
    } else if (footMode == 'walk') {
      c.drawOval(Rect.fromCenter(center: Offset(-14*s,-2*s-lsX*0.4), width: 10*s, height: 8*s), black);
      c.drawOval(Rect.fromCenter(center: Offset(14*s,-2*s+lsX*0.4), width: 10*s, height: 8*s), black);
    } else if (ch.state == CharState.typing) {
      final tOff = math.sin(ch.anim*18)*4*s;
      c.drawOval(Rect.fromCenter(center: Offset(-14*s,-2*s+tOff), width: 10*s, height: 8*s), black);
      c.drawOval(Rect.fromCenter(center: Offset(14*s,-2*s-tOff), width: 10*s, height: 8*s), black);
    } else if (ch.state == CharState.sleeping) {
      c.drawOval(Rect.fromCenter(center: Offset(-12*s,2*s), width: 8*s, height: 6*s), black);
      c.drawOval(Rect.fromCenter(center: Offset(12*s,2*s), width: 8*s, height: 6*s), black);
    } else if (ch.state == CharState.drinking) {
      final dBob = math.sin(ch.anim*4)*1.5*s;
      c.drawOval(Rect.fromCenter(center: Offset(-13*s,-2*s), width: 10*s, height: 8*s), black);
      c.drawOval(Rect.fromCenter(center: Offset(8*s,-10*s+dBob), width: 9*s, height: 7*s), black);
      // Cup
      c.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(5*s, -17*s+dBob, 8*s, 7*s), Radius.circular(1.5*s)),
          Paint()..color = const Color(0xFFFFFFFF));
      c.drawOval(Rect.fromCenter(center: Offset(9*s,-15*s+dBob), width: 6*s, height: 4*s),
          Paint()..color = const Color(0xFF8B6914));
      // Steam above cup
      final steamOff = math.sin(ch.anim*3)*1.5*s;
      final steamP = Paint()..color = _kSteamColor..strokeWidth = 0.8*s..strokeCap = StrokeCap.round..style = PaintingStyle.stroke;
      c.drawPath(Path()..moveTo(8*s, -18*s+dBob)
        ..quadraticBezierTo(10*s, -21*s+dBob+steamOff, 8*s, -23*s+dBob+steamOff), steamP);
      c.drawPath(Path()..moveTo(12*s, -18*s+dBob)
        ..quadraticBezierTo(14*s, -20*s+dBob-steamOff, 12*s, -22*s+dBob-steamOff), steamP);
    } else {
      final iOff = math.sin(ch.anim*3)*1.5*s;
      c.drawOval(Rect.fromCenter(center: Offset(-14*s,-2*s+iOff), width: 10*s, height: 8*s), black);
      c.drawOval(Rect.fromCenter(center: Offset(14*s,-2*s-iOff), width: 10*s, height: 8*s), black);
    }
    // Eyes
    if (facing != 'back') {
      final eyeY = -12*s;
      final wp = Paint()..color = const Color(0xFFFFFFFF);
      final pp = Paint()..color = const Color(0xFF111111);
      final hp = Paint()..color = const Color(0xFFFFFFFF);
      final blush = Paint()..color = const Color.fromRGBO(255,150,150,0.25);
      final blushStrong = Paint()..color = const Color.fromRGBO(255,150,150,0.35);
      final closedP = Paint()..color = const Color(0xFFFFFFFF)..strokeWidth = 1.8*s..strokeCap = StrokeCap.round..style = PaintingStyle.stroke;

      if (ch.state == CharState.sleeping) {
        c.drawCircle(Offset(-5.5*s,eyeY), 5.2*s, black);
        c.drawCircle(Offset(5.5*s,eyeY), 5.2*s, black);
        c.drawArc(Rect.fromCircle(center: Offset(-5.5*s,eyeY+s), radius: 3*s), math.pi+0.3, -0.6, false, closedP);
        c.drawArc(Rect.fromCircle(center: Offset(5.5*s,eyeY+s), radius: 3*s), math.pi+0.3, -0.6, false, closedP);
        txt(c, 'z', Offset(12*s, -18*s), 6*s, const Color(0xFF888888), weight: FontWeight.bold);
        txt(c, 'z', Offset(16*s, -24*s), 4.5*s, const Color(0xFF888888), weight: FontWeight.bold);
      } else if (ch.state == CharState.sitting) {
        c.drawCircle(Offset(-5.5*s,eyeY), 5*s, wp);
        c.drawCircle(Offset(5.5*s,eyeY), 5*s, wp);
        c.drawCircle(Offset(-5*s,eyeY+0.5*s), 2.5*s, pp);
        c.drawCircle(Offset(6*s,eyeY+0.5*s), 2.5*s, pp);
        c.drawCircle(Offset(-4*s,eyeY-0.5*s), s, hp);
        c.drawCircle(Offset(7*s,eyeY-0.5*s), s, hp);
        c.drawCircle(Offset(-9*s,-7*s), 3.5*s, blushStrong);
        c.drawCircle(Offset(9*s,-7*s), 3.5*s, blushStrong);
      } else if (ch.state == CharState.running) {
        c.drawCircle(Offset(-5.5*s,eyeY), 4.5*s, wp);
        c.drawCircle(Offset(5.5*s,eyeY), 4.5*s, wp);
        c.drawCircle(Offset(-4*s,eyeY), 2.2*s, pp);
        c.drawCircle(Offset(7*s,eyeY), 2.2*s, pp);
      } else if (ch.state == CharState.drinking) {
        c.drawCircle(Offset(-5.5*s,eyeY), 5.2*s, black);
        c.drawCircle(Offset(5.5*s,eyeY), 5.2*s, black);
        c.drawArc(Rect.fromCircle(center: Offset(-5.5*s,eyeY+s), radius: 3*s), math.pi+0.3, -0.6, false, closedP);
        c.drawArc(Rect.fromCircle(center: Offset(5.5*s,eyeY+s), radius: 3*s), math.pi+0.3, -0.6, false, closedP);
        c.drawCircle(Offset(-10*s,-6*s), 3*s, Paint()..color = const Color.fromRGBO(255,150,150,0.4));
        c.drawCircle(Offset(10*s,-6*s), 3*s, Paint()..color = const Color.fromRGBO(255,150,150,0.4));
      } else if (ch.state == CharState.typing) {
        c.drawCircle(Offset(-5.5*s,eyeY), 5*s, wp);
        c.drawCircle(Offset(5.5*s,eyeY), 5*s, wp);
        c.drawCircle(Offset(-5*s,eyeY+2*s), 2.5*s, pp);
        c.drawCircle(Offset(6*s,eyeY+2*s), 2.5*s, pp);
        c.drawCircle(Offset(-4*s,eyeY+0.5*s), 0.8*s, hp);
        c.drawCircle(Offset(7*s,eyeY+0.5*s), 0.8*s, hp);
      } else {
        c.drawCircle(Offset(-5.5*s,eyeY), 5*s, wp);
        c.drawCircle(Offset(5.5*s,eyeY), 5*s, wp);
        c.drawCircle(Offset(-4.5*s,eyeY+s), 2.5*s, pp);
        c.drawCircle(Offset(6.5*s,eyeY+s), 2.5*s, pp);
        c.drawCircle(Offset(-3.5*s,eyeY-0.5*s), s, hp);
        c.drawCircle(Offset(7.5*s,eyeY-0.5*s), s, hp);
      }
      if (![CharState.sleeping, CharState.sitting, CharState.drinking].contains(ch.state)) {
        c.drawCircle(Offset(-9*s,-7*s), 3*s, blush);
        c.drawCircle(Offset(9*s,-7*s), 3*s, blush);
      }
    }
    c.restore();

    // Chair backrest when typing
    if (facing == 'back' && ch.state == CharState.typing) {
      final bp = w(ch.x, ch.y); final bcr = ws(18);
      c.drawArc(Rect.fromCircle(center: Offset(bp.dx, bp.dy+bcr*0.9), radius: bcr*0.85), 0, math.pi, false,
          Paint()..color = const Color(0xFFDCDCDC));
      c.drawArc(Rect.fromCircle(center: Offset(bp.dx, bp.dy+bcr*0.9), radius: bcr*0.85), 0, math.pi, false,
          Paint()..color = const Color(0xFFC8C8C8)..strokeWidth = ws(0.6)..style = PaintingStyle.stroke);
    }
    // Floating name
    if (desks.isNotEmpty && ch.deskIdx < desks.length) {
      final d = desks[ch.deskIdx];
      if (_dist(ch.x, ch.y, d.x, d.y + chairOffset) > 30) {
        txt(c, ch.name, w(ch.x, ch.y + 28), ws(9), const Color.fromRGBO(0,0,0,0.5), weight: FontWeight.w600);
      }
    }
  }

  // ---- Cat ----
  void drawCat(Canvas c, _OfficeCat cat) {
    final p = w(cat.x, cat.y); final s = scale * 1.2;
    c.save(); c.translate(p.dx, p.dy); c.scale(cat.facingX, 1);
    final orange = Paint()..color = const Color(0xFFE8922A);
    final dark = Paint()..color = const Color(0xFFC47818);
    final pink = Paint()..color = const Color(0xFFF5B87A);

    if (cat.state == 'nap') {
      c.drawOval(Rect.fromCenter(center: Offset.zero, width: 20*s, height: 14*s), orange);
      c.drawOval(Rect.fromCenter(center: Offset(-3*s,-2*s), width: 4*s, height: 10*s), dark);
      c.drawOval(Rect.fromCenter(center: Offset(4*s,-1*s), width: 3.6*s, height: 8*s), dark);
      c.drawCircle(Offset(8*s,-2*s), 4.5*s, orange);
      // Ears
      c.drawPath(Path()..moveTo(6*s,-6*s)..lineTo(4*s,-10*s)..lineTo(9*s,-7*s)..close(), orange);
      c.drawPath(Path()..moveTo(10*s,-6*s)..lineTo(12*s,-10*s)..lineTo(13*s,-6*s)..close(), orange);
      c.drawPath(Path()..moveTo(6.5*s,-6.5*s)..lineTo(5*s,-9*s)..lineTo(8.5*s,-7*s)..close(), pink);
      c.drawPath(Path()..moveTo(10.5*s,-6.5*s)..lineTo(11.5*s,-9*s)..lineTo(12.5*s,-6.5*s)..close(), pink);
      // Closed eyes
      final cp = Paint()..color = const Color(0xFF555555)..strokeWidth = 0.8*s..strokeCap = StrokeCap.round..style = PaintingStyle.stroke;
      c.drawArc(Rect.fromCircle(center: Offset(7*s,-2.5*s), radius: 1.5*s), math.pi+0.3, -0.6, false, cp);
      c.drawArc(Rect.fromCircle(center: Offset(11*s,-2.5*s), radius: 1.5*s), math.pi+0.3, -0.6, false, cp);
      c.drawCircle(Offset(9.5*s,-0.5*s), 0.8*s, Paint()..color = const Color(0xFFD4726A));
      // Tail
      c.drawPath(Path()..moveTo(-8*s,2*s)..quadraticBezierTo(-12*s,-5*s,-6*s,-8*s),
          Paint()..color = const Color(0xFFE8922A)..strokeWidth = 2.5*s..strokeCap = StrokeCap.round..style = PaintingStyle.stroke);
      c.drawPath(Path()..moveTo(-7*s,-6*s)..quadraticBezierTo(-6*s,-8*s,-4*s,-7*s),
          Paint()..color = const Color(0xFFC47818)..strokeWidth = 2*s..strokeCap = StrokeCap.round..style = PaintingStyle.stroke);
      // Dream
      if (cat.dreamText != null && cat.dreamTimer > 1) {
        final by = -16*s - math.sin(cat.anim*2)*2*s;
        final bp = Paint()..color = const Color.fromRGBO(255,255,255,0.85);
        c.drawCircle(Offset(14*s, by+6*s), 2*s, bp);
        c.drawCircle(Offset(16*s, by+2*s), 3*s, bp);
        c.drawCircle(Offset(18*s, by-4*s), 6*s, bp);
        txt(c, cat.dreamText!, Offset(18*s, by-4*s), 5*s, const Color(0xFF555555));
      }
    } else {
      final isRun = cat.speed > cat.baseSpeed * 1.5;
      final ms = isRun ? 14.0 : 10.0;
      final bobY = math.sin(cat.anim*ms).abs() * (isRun?2.5:1.5) * s;
      c.translate(0, -bobY);
      c.drawOval(Rect.fromCenter(center: Offset.zero, width: 20*s, height: 12*s), orange);
      c.drawOval(Rect.fromCenter(center: Offset(-3*s,-1*s), width: 3.6*s, height: 8*s), dark);
      c.drawOval(Rect.fromCenter(center: Offset(3*s,-0.5*s), width: 3*s, height: 7*s), dark);
      c.drawOval(Rect.fromCenter(center: Offset(7*s,0), width: 2.6*s, height: 6*s), dark);
      final lo = math.sin(cat.anim*ms)*(isRun?3:2)*s;
      for (final leg in [Offset(-5*s, 6*s+lo), Offset(-1*s, 6*s-lo), Offset(4*s, 6*s-lo), Offset(8*s, 6*s+lo)]) {
        c.drawOval(Rect.fromCenter(center: leg, width: 5*s, height: 3.6*s), orange);
        c.drawOval(Rect.fromCenter(center: Offset(leg.dx, leg.dy+s), width: 3*s, height: 2*s),
            Paint()..color = const Color(0xFFF5DEB3));
      }
      final tw2 = math.sin(cat.anim*(isRun?10:6))*(isRun?5:3)*s;
      c.drawPath(Path()..moveTo(-8*s,0)..quadraticBezierTo(-14*s+tw2,-8*s,-10*s+tw2,-14*s),
          Paint()..color = const Color(0xFFE8922A)..strokeWidth = 2.5*s..strokeCap = StrokeCap.round..style = PaintingStyle.stroke);
      c.drawPath(Path()..moveTo(-11*s+tw2,-12*s)..quadraticBezierTo(-10*s+tw2,-15*s,-8*s+tw2,-13*s),
          Paint()..color = const Color(0xFFC47818)..strokeWidth = 2*s..strokeCap = StrokeCap.round..style = PaintingStyle.stroke);
      c.drawCircle(Offset(10*s,-4*s), 5.5*s, orange);
      c.drawPath(Path()..moveTo(6*s,-7*s)..lineTo(4*s,-13*s)..lineTo(10*s,-8*s)..close(), orange);
      c.drawPath(Path()..moveTo(13*s,-7*s)..lineTo(16*s,-13*s)..lineTo(16*s,-7*s)..close(), orange);
      c.drawPath(Path()..moveTo(6.5*s,-8*s)..lineTo(5*s,-12*s)..lineTo(9.5*s,-8.5*s)..close(), pink);
      c.drawPath(Path()..moveTo(13.5*s,-7.5*s)..lineTo(15*s,-12*s)..lineTo(15.5*s,-7.5*s)..close(), pink);
      c.drawCircle(Offset(8*s,-4.5*s), 2.5*s, Paint()..color = const Color(0xFFFFFFFF));
      c.drawCircle(Offset(14*s,-4.5*s), 2.5*s, Paint()..color = const Color(0xFFFFFFFF));
      c.drawCircle(Offset(8.5*s,-4*s), 1.8*s, Paint()..color = const Color(0xFF44AA88));
      c.drawCircle(Offset(14.5*s,-4*s), 1.8*s, Paint()..color = const Color(0xFF44AA88));
      c.drawOval(Rect.fromCenter(center: Offset(9*s,-3.8*s), width: 1.6*s, height: 2.4*s), Paint()..color = const Color(0xFF111111));
      c.drawOval(Rect.fromCenter(center: Offset(15*s,-3.8*s), width: 1.6*s, height: 2.4*s), Paint()..color = const Color(0xFF111111));
      c.drawCircle(Offset(8*s,-5*s), 0.6*s, Paint()..color = const Color(0xFFFFFFFF));
      c.drawCircle(Offset(14*s,-5*s), 0.6*s, Paint()..color = const Color(0xFFFFFFFF));
      c.drawPath(Path()..moveTo(11*s,-2.5*s)..lineTo(10.5*s,-1.5*s)..lineTo(11.5*s,-1.5*s)..close(),
          Paint()..color = const Color(0xFFD4726A));
      // Mouth
      final mouthP = Paint()..color = _kMouthColor..strokeWidth = 0.5*s..strokeCap = StrokeCap.round..style = PaintingStyle.stroke;
      c.drawLine(Offset(11*s, -1.5*s), Offset(10*s, -0.5*s), mouthP);
      c.drawLine(Offset(11*s, -1.5*s), Offset(12*s, -0.5*s), mouthP);
      // Whiskers
      final whiskerP = Paint()..color = _kWhiskerColor..strokeWidth = 0.4*s..strokeCap = StrokeCap.round..style = PaintingStyle.stroke;
      c.drawLine(Offset(7*s, -1.5*s), Offset(2*s, -2.5*s), whiskerP);
      c.drawLine(Offset(7*s, -1*s), Offset(2*s, -0.5*s), whiskerP);
      c.drawLine(Offset(15*s, -1.5*s), Offset(20*s, -2.5*s), whiskerP);
      c.drawLine(Offset(15*s, -1*s), Offset(20*s, -0.5*s), whiskerP);
    }
    c.restore();
    txt(c, 'Mochi', w(cat.x, cat.y+22), ws(8), const Color.fromRGBO(232,146,42,0.6), weight: FontWeight.w600);
  }

  // ---- Particles ----
  void drawParticles(Canvas c) {
    for (final p in particles) {
      c.drawCircle(w(p.x, p.y), p.size * p.life,
          Paint()..color = p.color.withOpacity(p.life.clamp(0.0, 1.0)));
    }
  }

  // ---- Steam ----
  void drawSteam(Canvas c) {
    final t = w(150, 140);
    for (int i=0; i<4; i++) {
      final v = (globalTime*0.5+i*0.6) % 2.5;
      if (v < 2) c.drawCircle(Offset(t.dx + math.sin(v*2.5+i*1.2)*ws(8), t.dy - v*ws(18)),
          ws(3+v*5), Paint()..color = const Color.fromRGBO(200,200,200,0.18));
    }
  }

  // ---- Cat pet effect ----
  void drawCatPet(Canvas c) {
    if (catPetText == null) return;
    final p = w(cat.x, cat.y - 20*scale);
    const notes = ['♪','♫','♩','♬'];
    for (int i=0; i<3; i++) {
      final v = (globalTime*3+i*0.8) % 2.5;
      if (v > 2) continue;
      txt(c, notes[i], Offset(p.dx + math.sin(v*2+i)*ws(10), p.dy - v*ws(15)),
          ws(10), const Color(0xFFE8922A).withOpacity((1-v/2.5).clamp(0.0,1.0)));
    }
    txt(c, 'purrrr~', Offset(p.dx, p.dy+ws(5)), ws(9), const Color.fromRGBO(232,146,42,0.7));
  }

  @override
  void paint(Canvas c, Size size) {
    c.drawRect(Rect.fromLTWH(0, 0, size.width, size.height), Paint()..color = const Color(0xFFFFFFFF));
    drawZones(c); drawLabels(c);
    for (int i=0; i<desks.length; i++) {
      final d = desks[i];
      bool active = chars.any((ch) => ch.state == CharState.typing && _dist(ch.x, ch.y, d.x, d.y+chairOffset) < 10);
      drawDesk(c, d.x, d.y);
      drawMonitor(c, d.x, d.y-45, active, i);
      drawChair(c, d.x, d.y+chairOffset);
      if (i < chars.length) drawNameplate(c, d, chars[i].name, chars[i].scarf);
    }
    drawBreakArea(c); drawTreadmill(c); drawSofa(c);
    final sorted = List<OfficeChar>.from(chars)..sort((a,b) => a.y.compareTo(b.y));
    for (final ch in sorted) drawChar(c, ch);
    drawCat(c, cat); drawCatPet(c); drawSteam(c); drawParticles(c);
  }

  @override
  bool shouldRepaint(covariant _OfficePainter old) => true;
}

// ==================== OFFICE SCENE WIDGET ====================
class OfficeScene extends StatefulWidget {
  final List<Map<String, dynamic>> agents;
  final void Function(Map<String, dynamic> agent)? onAgentTap;
  final void Function(String message)? onToast;
  const OfficeScene({super.key, required this.agents, this.onAgentTap, this.onToast});
  @override State<OfficeScene> createState() => _OfficeSceneState();
}

class _OfficeSceneState extends State<OfficeScene> with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  final _rng = math.Random(42);
  List<OfficeChar> _chars = [];
  List<_Desk> _desks = [];
  late _OfficeCat _cat;
  List<_Particle> _particles = [];
  double _globalTime = 0, _lastTs = 0, _scale = 1;
  Offset _camOffset = Offset.zero;
  double _eventTimer = 30, _celebTimer = 25, _deliveryTimer = 0;
  String? _catPetText;
  double _catPetTimer = 0;
  bool _deliveryActive = false;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(hours: 1))..repeat();
    _initScene();
  }

  @override
  void didUpdateWidget(covariant OfficeScene old) {
    super.didUpdateWidget(old);
    if (widget.agents != old.agents) _rebuildChars();
  }

  void _initScene() { _buildDesks(); _rebuildChars(); _cat = _OfficeCat(); }

  void _buildDesks() {
    const _desks = [];
    final count = widget.agents.length.clamp(1, 8);
    for (int r = 0; r < (count / 2).ceil(); r++)
      for (int col = 0; col < 2 && _desks.length < count; col++)
        _desks.add(_Desk(420 + col * 200, 110 + r * 200));
  }

  void _rebuildChars() {
    _buildDesks();
    const _chars = [];
    for (int i = 0; i < widget.agents.length && i < _desks.length; i++) {
      final a = widget.agents[i];
      final grad = a['gradient'] as List?;
      final scarfHex = grad?[0] as String? ?? a['color'] as String? ?? '#667eea';
      final name = a['name'] as String? ?? a['id'] as String? ?? 'Agent';
      final status = a['status'] as String? ?? 'idle';
      CharState initState = CharState.typing;
      double sx = _desks[i].x, sy = _desks[i].y + chairOffset;
      if (i == 3 && widget.agents.length > 3) { initState = CharState.drinking; sx = locCoffee.dx; sy = locCoffee.dy; }
      else if (i == 6 && widget.agents.length > 6) { initState = CharState.sitting; sx = locSofa.dx; sy = locSofa.dy; }
      else if (status == 'idle' || status == 'offline') initState = CharState.idle;
      _chars.add(OfficeChar(id: a['id'] ?? 'agent$i', name: name, scarf: _hex(scarfHex),
        deskIdx: i, deskAt: (idx) => _desks[idx.clamp(0, _desks.length-1)],
        state: initState, startX: sx, startY: sy));
    }
  }

  void _update(double dt) {
    _globalTime += dt;
    for (final ch in _chars) {
      ch.anim += dt;
      if (ch.state == CharState.walking) {
        final d = _dist(ch.x, ch.y, ch.tx, ch.ty);
        if (d < 3) {
          if (ch.route.isNotEmpty) { final n = ch.route.removeAt(0); ch.tx = n.dx; ch.ty = n.dy; }
          else { ch.x = ch.tx; ch.y = ch.ty;
            if (ch.nextState != null) { ch.setCharState(ch.nextState!, _rng); ch.nextState = null; }
          }
        } else {
          final dx = ch.tx - ch.x, dy = ch.ty - ch.y, len = math.sqrt(dx*dx+dy*dy);
          final step = ch.speed < len ? ch.speed : len;
          ch.x += dx/len*step; ch.y += dy/len*step; ch.angle = math.atan2(dy, dx);
        }
      }
      if (ch.state != CharState.walking) {
        ch.stateTimer -= dt;
        if (ch.stateTimer <= 0) { _autoSwitch(ch); ch.stateTimer = _rrand(_rng, 5, 15); }
      }
    }
    _cat.update(dt, _rng);
    for (int i = _particles.length-1; i >= 0; i--) {
      final p = _particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life -= dt*0.8;
      if (p.life <= 0) _particles.removeAt(i);
    }
    if (_deliveryActive) { _deliveryTimer -= dt;
      if (_deliveryTimer <= 0) { _deliveryActive = false;
        for (final ch in _chars)
          if (ch.state == CharState.drinking && _dist(ch.x, ch.y, locCoffee.dx, locCoffee.dy) < 60)
            ch.walkTo(ch.homeDesk.dx, ch.homeDesk.dy, CharState.typing, _rng);
      }
    }
    _eventTimer -= dt;
    if (_eventTimer <= 0 && !_deliveryActive) { _triggerDelivery(); _eventTimer = _rrand(_rng, 60, 120); }
    _celebTimer -= dt;
    if (_celebTimer <= 0) {
      final typer = _chars.cast<OfficeChar?>().firstWhere((c) => c?.state == CharState.typing, orElse: () => null);
      if (typer != null) _spawnCelebration(typer.x, typer.y);
      _celebTimer = _rrand(_rng, 30, 60);
    }
    if (_catPetText != null) { _catPetTimer -= dt; if (_catPetTimer <= 0) _catPetText = null; }
  }

  void _autoSwitch(OfficeChar ch) {
    final r = _rng.nextDouble();
    switch (ch.state) {
      case CharState.idle:
        if (r < 0.7) ch.setCharState(CharState.typing, _rng);
        else _goToRandomArea(ch); break;
      case CharState.typing:
        if (r < 0.7) ch.stateTimer = _rrand(_rng, 10, 20);
        else if (!_goToRandomArea(ch)) ch.stateTimer = _rrand(_rng, 10, 20); break;
      case CharState.sleeping: case CharState.sitting: case CharState.running: case CharState.drinking:
        final h = ch.homeDesk; ch.walkTo(h.dx, h.dy, CharState.typing, _rng); break;
      case CharState.walking: break;
    }
  }

  bool _goToRandomArea(OfficeChar ch) {
    final choices = [
      (locCoffee, CharState.drinking, 3),
      (locSofa, CharState.sitting, 1),
      (locTreadmill, CharState.running, 1),
    ];
    choices.shuffle(_rng);
    for (final (loc, state, max) in choices) {
      if (!_tryGoToArea(ch, loc, state, max)) return true;
    }
    return false;
  }

  bool _tryGoToArea(OfficeChar ch, Offset loc, CharState target, int maxOcc) {
    int occ = 0;
    for (final other in _chars) {
      if (identical(other, ch)) continue;
      if (_dist(other.x, other.y, loc.dx, loc.dy) < 55 && other.state != CharState.walking) occ++;
      if (other.state == CharState.walking) {
        final dest = other.route.isNotEmpty ? other.route.last : Offset(other.tx, other.ty);
        if (_dist(dest.dx, dest.dy, loc.dx, loc.dy) < 55) occ++;
      }
    }
    if (occ >= maxOcc) return true;
    const offsets = [Offset(0,0), Offset(28,12), Offset(-25,15)];
    final o = offsets[occ.clamp(0, offsets.length-1)];
    ch.walkTo(loc.dx+o.dx, loc.dy+o.dy, target, _rng);
    return false;
  }

  void _triggerDelivery() {
    _deliveryActive = true; _deliveryTimer = 15;
    _showToast('🍕 外卖到了！');
    for (final ch in _chars)
      if (ch.state == CharState.typing)
        ch.walkTo(locCoffee.dx+(_rng.nextDouble()-0.5)*30, locCoffee.dy+(_rng.nextDouble()-0.5)*20, CharState.drinking, _rng);
  }

  void _spawnCelebration(double x, double y) {
    for (int i=0; i<12; i++) {
      final angle = (i/12)*math.pi*2, speed = 2+_rng.nextDouble()*3;
      _particles.add(_Particle(x: x, y: y, vx: math.cos(angle)*speed, vy: math.sin(angle)*speed-2,
        life: 1, color: HSLColor.fromAHSL(1, _rng.nextDouble()*360, 0.8, 0.6).toColor(),
        size: _scale*(2+_rng.nextDouble()*2)));
    }
  }

  void _handleTap(Offset pos) {
    final wx = (pos.dx - _camOffset.dx) / _scale;
    final wy = (pos.dy - _camOffset.dy) / _scale;
    if (_dist(wx, wy, _cat.x, _cat.y) < 25) {
      setState(() { _catPetText = 'purrrr~'; _catPetTimer = 2; });
      _cat.tx = _cat.x; _cat.ty = _cat.y; _cat.route.clear();
      _spawnCelebration(_cat.x, _cat.y);
      _showToast('🐱 Mochi 发出呼噜声：purrrr~');
      return;
    }
    for (final ch in _chars) {
      if (_dist(wx, wy, ch.x, ch.y) < 30) {
        _spawnCelebration(ch.x, ch.y);
        const msgs = ['加油！💪','快完成了！','代码很棒！','专注时间！','加载中...','💡 灵感！','Bug 修好了！','发布！🚀'];
        _showToast('${ch.name}: ${msgs[_rng.nextInt(msgs.length)]}');
        final a = widget.agents.cast<Map<String,dynamic>?>().firstWhere((a) => a?['id'] == ch.id, orElse: () => null);
        if (a != null && widget.onAgentTap != null) widget.onAgentTap!(a);
        return;
      }
    }
  }

  void _showToast(String message) {
    if (widget.onToast != null) {
      widget.onToast!(message);
    } else if (mounted) {
      ScaffoldMessenger.of(context).clearSnackBars();
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(message, style: TextStyle(fontSize: 14)),
        duration: const Duration(seconds: 2),
        behavior: SnackBarBehavior.floating,
        margin: EdgeInsets.only(bottom: 60, left: 20, right: 20),
      ));
    }
  }

  @override
  void dispose() { _ctrl.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, box) {
      final cw = box.maxWidth, ch2 = box.maxHeight;
      _scale = (cw/worldW).clamp(0.3, 2.0) * 0.95;
      if ((ch2/worldH)*0.95 < _scale) _scale = (ch2/worldH)*0.95;
      _camOffset = Offset(cw/2 - (worldW/2)*_scale, ch2/2 - (worldH/2)*_scale);
      return GestureDetector(
        onTapDown: (d) => _handleTap(d.localPosition),
        onDoubleTap: () {
          setState(() {
            _scale = (cw/worldW).clamp(0.3, 2.0) * 0.95;
            if ((ch2/worldH)*0.95 < _scale) _scale = (ch2/worldH)*0.95;
            _camOffset = Offset(cw/2 - (worldW/2)*_scale, ch2/2 - (worldH/2)*_scale);
          });
        },
        child: AnimatedBuilder(
          animation: _ctrl,
          builder: (context, _) {
            final now = _ctrl.lastElapsedDuration?.inMicroseconds.toDouble() ?? 0;
            final ts = now / 1000000;
            final dt = _lastTs > 0 ? (ts - _lastTs).clamp(0.0, 0.1) : 0.016;
            _lastTs = ts;
            _update(dt);
            return CustomPaint(
              painter: _OfficePainter(chars: _chars, desks: _desks, particles: _particles,
                cat: _cat, globalTime: _globalTime, scale: _scale, camOffset: _camOffset,
                catPetText: _catPetText),
              size: Size(cw, ch2),
            );
          },
        ),
      );
    });
  }
}
