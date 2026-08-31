import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:flutter_hbb/consts.dart';
import 'package:flutter_hbb/desktop/theme/desktop_home_theme.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:flutter_hbb/models/platform_model.dart';

import '../../common.dart';

typedef KBChosenCallback = Future<bool> Function(String);

const double _kCardGap = 12.0;
const String _kKBLayoutTypeISO = 'ISO';
const String _kKBLayoutTypeNotISO = 'Not ISO';

const _kKBLayoutImageMap = {
  _kKBLayoutTypeISO: 'kb_layout_iso',
  _kKBLayoutTypeNotISO: 'kb_layout_not_iso',
};

class _KBImage extends StatelessWidget {
  final String kbLayoutType;
  final double imageWidth;
  const _KBImage({
    Key? key,
    required this.kbLayoutType,
    required this.imageWidth,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return SvgPicture.asset(
      'assets/${_kKBLayoutImageMap[kbLayoutType] ?? ""}.svg',
      width: imageWidth - 32,
    );
  }
}

class _KBChooser extends StatelessWidget {
  final String kbLayoutType;
  final double imageWidth;
  final RxString chosenType;
  final KBChosenCallback cb;
  const _KBChooser({
    Key? key,
    required this.kbLayoutType,
    required this.imageWidth,
    required this.chosenType,
    required this.cb,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    onChanged(String? v) async {
      if (v != null) {
        if (await cb(v)) {
          chosenType.value = v;
        }
      }
    }

    return Obx(() {
      final selected = chosenType.value == kbLayoutType;
      return Semantics(
        selected: selected,
        button: true,
        label: kbLayoutType,
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: () => onChanged(kbLayoutType),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 140),
              width: imageWidth,
              padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
              decoration: BoxDecoration(
                color: selected
                    ? DesktopHomeTheme.brand.withOpacity(0.07)
                    : DesktopHomeTheme.surfaceMuted(context),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: selected
                      ? DesktopHomeTheme.brand
                      : DesktopHomeTheme.border(context),
                  width: selected ? 1.5 : 1,
                ),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Expanded(
                    child: Center(
                      child: _KBImage(
                        kbLayoutType: kbLayoutType,
                        imageWidth: imageWidth,
                      ),
                    ),
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      AnimatedContainer(
                        duration: const Duration(milliseconds: 140),
                        width: 18,
                        height: 18,
                        decoration: BoxDecoration(
                          color: selected
                              ? DesktopHomeTheme.brand
                              : Colors.transparent,
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: selected
                                ? DesktopHomeTheme.brand
                                : DesktopHomeTheme.textSecondary(context),
                            width: 1.3,
                          ),
                        ),
                        child: selected
                            ? const Icon(Icons.check_rounded,
                                size: 13, color: Colors.white)
                            : null,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        kbLayoutType,
                        style: TextStyle(
                          color: selected
                              ? DesktopHomeTheme.brand
                              : DesktopHomeTheme.textPrimary(context),
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    });
  }
}

class KBLayoutTypeChooser extends StatelessWidget {
  final RxString chosenType;
  final double width;
  final double height;
  final KBChosenCallback cb;
  KBLayoutTypeChooser({
    Key? key,
    required this.chosenType,
    required this.width,
    required this.height,
    required this.cb,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final imageWidth = (width - _kCardGap) / 2;
    return SizedBox(
      width: width,
      height: height,
      child: Center(
        child: Row(
          children: [
            _KBChooser(
              kbLayoutType: _kKBLayoutTypeISO,
              imageWidth: imageWidth,
              chosenType: chosenType,
              cb: cb,
            ),
            const SizedBox(width: _kCardGap),
            _KBChooser(
              kbLayoutType: _kKBLayoutTypeNotISO,
              imageWidth: imageWidth,
              chosenType: chosenType,
              cb: cb,
            ),
          ],
        ),
      ),
    );
  }
}

RxString KBLayoutType = ''.obs;

String getLocalPlatformForKBLayoutType(String peerPlatform) {
  String localPlatform = '';
  if (peerPlatform != kPeerPlatformMacOS) {
    return localPlatform;
  }

  if (isWindows) {
    localPlatform = kPeerPlatformWindows;
  } else if (isLinux) {
    localPlatform = kPeerPlatformLinux;
  } else if (isWebOnWindows || isWebOnLinux) {
    localPlatform = kPeerPlatformWebDesktop;
  }
  return localPlatform;
}

showKBLayoutTypeChooserIfNeeded(
  String peerPlatform,
  OverlayDialogManager dialogManager,
) async {
  final localPlatform = getLocalPlatformForKBLayoutType(peerPlatform);
  if (localPlatform == '') {
    return;
  }
  KBLayoutType.value = bind.getLocalKbLayoutType();
  if (KBLayoutType.value == _kKBLayoutTypeISO ||
      KBLayoutType.value == _kKBLayoutTypeNotISO) {
    return;
  }
  showKBLayoutTypeChooser(localPlatform, dialogManager);
}

showKBLayoutTypeChooser(
  String localPlatform,
  OverlayDialogManager dialogManager,
) {
  dialogManager.show((setState, close, context) {
    return CustomAlertDialog(
      title:
          Text('${translate('Select local keyboard type')} ($localPlatform)'),
      content: KBLayoutTypeChooser(
          chosenType: KBLayoutType,
          width: 360,
          height: 184,
          cb: (String v) async {
            await bind.setLocalKbLayoutType(kbLayoutType: v);
            KBLayoutType.value = bind.getLocalKbLayoutType();
            return v == KBLayoutType.value;
          }),
      actions: [dialogButton('Close', onPressed: close, isOutline: true)],
      onCancel: close,
    );
  });
}
