import 'dart:collection';
import 'dart:io';
import 'dart:typed_data';

import 'package:image/image.dart' as img;
import 'package:image/src/formats/ico_encoder.dart';

bool _isExteriorBackground(img.Pixel pixel) {
  final r = pixel.r.toInt();
  final g = pixel.g.toInt();
  final b = pixel.b.toInt();
  final max = [r, g, b].reduce((a, b) => a > b ? a : b);
  final min = [r, g, b].reduce((a, b) => a < b ? a : b);
  return min >= 224 && max - min <= 24;
}

img.Image _removeExteriorBackground(img.Image source) {
  final rgba = source.convert(numChannels: 4);
  final visited = Uint8List(rgba.width * rgba.height);
  final queue = Queue<int>();

  void enqueue(int x, int y) {
    final index = y * rgba.width + x;
    if (visited[index] != 0) return;
    visited[index] = 1;
    if (_isExteriorBackground(rgba.getPixel(x, y))) queue.add(index);
  }

  for (var x = 0; x < rgba.width; x++) {
    enqueue(x, 0);
    enqueue(x, rgba.height - 1);
  }
  for (var y = 0; y < rgba.height; y++) {
    enqueue(0, y);
    enqueue(rgba.width - 1, y);
  }

  while (queue.isNotEmpty) {
    final index = queue.removeFirst();
    final x = index % rgba.width;
    final y = index ~/ rgba.width;
    final pixel = rgba.getPixel(x, y);
    rgba.setPixelRgba(x, y, pixel.r, pixel.g, pixel.b, 0);
    if (x > 0) enqueue(x - 1, y);
    if (x + 1 < rgba.width) enqueue(x + 1, y);
    if (y > 0) enqueue(x, y - 1);
    if (y + 1 < rgba.height) enqueue(x, y + 1);
  }

  var left = rgba.width;
  var top = rgba.height;
  var right = 0;
  var bottom = 0;
  for (final pixel in rgba) {
    if (pixel.a.toInt() < 8) continue;
    if (pixel.x < left) left = pixel.x;
    if (pixel.y < top) top = pixel.y;
    if (pixel.x > right) right = pixel.x;
    if (pixel.y > bottom) bottom = pixel.y;
  }

  final cropped = img.copyCrop(
    rgba,
    x: left,
    y: top,
    width: right - left + 1,
    height: bottom - top + 1,
  );
  final side = cropped.width > cropped.height ? cropped.width : cropped.height;
  final padding = (side * 0.04).round();
  final canvas = img.Image(
      width: side + padding * 2, height: side + padding * 2, numChannels: 4);
  img.compositeImage(
    canvas,
    cropped,
    dstX: (canvas.width - cropped.width) ~/ 2,
    dstY: (canvas.height - cropped.height) ~/ 2,
  );
  return canvas;
}

void _writePng(String path, img.Image source, int size) {
  final resized = img.copyResize(source,
      width: size, height: size, interpolation: img.Interpolation.average);
  File(path)
    ..parent.createSync(recursive: true)
    ..writeAsBytesSync(img.encodePng(resized, level: 9));
}

void _writeIco(String path, img.Image source, List<int> sizes) {
  final frames = sizes
      .map((size) => img.copyResize(source,
          width: size, height: size, interpolation: img.Interpolation.average))
      .toList();
  File(path)
    ..parent.createSync(recursive: true)
    ..writeAsBytesSync(IcoEncoder().encodeImages(frames));
}

img.Image _adaptiveForeground(img.Image source) {
  final canvas = img.Image(
      width: source.width * 3 ~/ 2,
      height: source.height * 3 ~/ 2,
      numChannels: 4);
  img.compositeImage(canvas, source,
      dstX: (canvas.width - source.width) ~/ 2,
      dstY: (canvas.height - source.height) ~/ 2);
  return canvas;
}

img.Image _notificationMark(img.Image source) {
  final mark = img.Image(
      width: source.width, height: source.height, numChannels: 4);
  for (final pixel in source) {
    final r = pixel.r.toInt();
    final g = pixel.g.toInt();
    final b = pixel.b.toInt();
    final max = [r, g, b].reduce((a, b) => a > b ? a : b);
    final min = [r, g, b].reduce((a, b) => a < b ? a : b);
    final alpha = min > 170 && max - min < 55 ? pixel.a.toInt() : 0;
    mark.setPixelRgba(pixel.x, pixel.y, 255, 255, 255, alpha);
  }
  return mark;
}

void main(List<String> args) {
  final root = args.isEmpty ? Directory.current.parent.path : args.first;
  final source = img.decodePng(File('$root/logo/logo.png').readAsBytesSync());
  if (source == null) throw StateError('Unable to decode logo/logo.png');
  final transparent = _removeExteriorBackground(source);

  _writePng('$root/flutter/assets/icon.png', transparent, 512);
  _writePng('$root/res/icon.png', transparent, 256);
  _writePng('$root/res/128x128@2x.png', transparent, 256);
  _writePng('$root/res/mac-icon.png', transparent, 512);
  const iconSizes = [16, 24, 32, 48, 64, 128, 256];
  _writeIco('$root/flutter/windows/runner/resources/app_icon.ico', transparent,
      iconSizes);
  _writeIco('$root/res/icon.ico', transparent, iconSizes);
  _writeIco('$root/res/tray-icon.ico', transparent, [16, 24, 32]);

  const androidSizes = {
    'mdpi': [48, 108, 24],
    'hdpi': [72, 162, 36],
    'xhdpi': [96, 216, 48],
    'xxhdpi': [144, 324, 72],
    'xxxhdpi': [192, 432, 96],
  };
  final foreground = _adaptiveForeground(transparent);
  final notification = _notificationMark(transparent);
  for (final entry in androidSizes.entries) {
    final dir = '$root/flutter/android/app/src/main/res/mipmap-${entry.key}';
    _writePng('$dir/ic_launcher.png', transparent, entry.value[0]);
    _writePng('$dir/ic_launcher_round.png', transparent, entry.value[0]);
    _writePng('$dir/ic_launcher_foreground.png', foreground, entry.value[1]);
    _writePng('$dir/ic_stat_logo.png', notification, entry.value[2]);
  }
}
