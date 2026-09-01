import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_hbb/common.dart';
import 'package:flutter_hbb/consts.dart';
import 'package:flutter_hbb/desktop/theme/desktop_home_theme.dart';
import 'package:flutter_hbb/models/state_model.dart';
import 'package:flutter_hbb/models/platform_model.dart';

class SidebarServiceStatus extends StatefulWidget {
  const SidebarServiceStatus({super.key, this.compact = false});

  final bool compact;

  @override
  State<SidebarServiceStatus> createState() => _SidebarServiceStatusState();
}

class _SidebarServiceStatusState extends State<SidebarServiceStatus> {
  Timer? _timer;
  bool _stopped = false;
  bool _starting = false;
  SvcStatus _status = SvcStatus.notReady;

  @override
  void initState() {
    super.initState();
    _timer = periodic_immediate(const Duration(seconds: 1), _refresh);
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _refresh() async {
    final stopped = await mainGetBoolOption(kOptionStopService);
    var status = SvcStatus.notReady;
    try {
      final data =
          jsonDecode(await bind.mainGetConnectStatus()) as Map<String, dynamic>;
      final value = data['status_num'] as int;
      status = value == 1
          ? SvcStatus.ready
          : value == 0
              ? SvcStatus.connecting
              : SvcStatus.notReady;
      stateGlobal.svcStatus.value = status;
      final videoConnections = data['video_conn_count'];
      if (videoConnections is int) {
        stateGlobal.videoConnCount.value = videoConnections;
      }
    } catch (_) {}
    if (!mounted) return;
    setState(() {
      _stopped = stopped;
      _status = status;
      if (!stopped) _starting = false;
    });
  }

  Future<void> _startService() async {
    if (_starting) return;
    setState(() => _starting = true);
    await start_service(true);
    await _refresh();
  }

  @override
  Widget build(BuildContext context) {
    final stopped = _stopped || _starting;
    final color = stopped || _status == SvcStatus.connecting
        ? DesktopHomeTheme.warning
        : _status == SvcStatus.ready
            ? DesktopHomeTheme.success
            : DesktopHomeTheme.danger;
    final label = stopped
        ? translate('Start service')
        : _status == SvcStatus.ready
            ? translate('Ready')
            : _status == SvcStatus.connecting
                ? translate('Connecting...')
                : translate('not_ready_status');

    final content = Padding(
      padding: EdgeInsets.symmetric(
          horizontal: widget.compact ? 0 : 16, vertical: 9),
      child: Row(
        mainAxisAlignment:
            widget.compact ? MainAxisAlignment.center : MainAxisAlignment.start,
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          if (!widget.compact) ...[
            const SizedBox(width: 9),
            Flexible(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: stopped
                      ? DesktopHomeTheme.textPrimary(context)
                      : DesktopHomeTheme.textSecondary(context),
                  fontSize: 12,
                  fontWeight: stopped ? FontWeight.w600 : FontWeight.w500,
                ),
              ),
            ),
          ],
        ],
      ),
    );

    final interactive = Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: stopped ? _startService : null,
        child: content,
      ),
    );
    return widget.compact
        ? Tooltip(message: label, child: interactive)
        : interactive;
  }
}
