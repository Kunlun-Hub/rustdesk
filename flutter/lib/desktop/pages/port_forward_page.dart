import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_hbb/common.dart';
import 'package:flutter_hbb/desktop/widgets/tabbar_widget.dart';
import 'package:flutter_hbb/desktop/theme/desktop_home_theme.dart';
import 'package:flutter_hbb/models/model.dart';
import 'package:flutter_hbb/models/platform_model.dart';
import 'package:get/get.dart';

const double _kColumn1Width = 30;
const double _kColumn4Width = 100;
const double _kRowHeight = 60;
const double _kTextLeftMargin = 20;

class _PortForward {
  int localPort;
  String remoteHost;
  int remotePort;

  _PortForward.fromJson(List<dynamic> json)
      : localPort = json[0] as int,
        remoteHost = json[1] as String,
        remotePort = json[2] as int;
}

class PortForwardPage extends StatefulWidget {
  PortForwardPage({
    Key? key,
    required this.id,
    required this.password,
    required this.tabController,
    required this.isRDP,
    required this.isSharedPassword,
    this.forceRelay,
    this.connToken,
  }) : super(key: key);
  final String id;
  final String? password;
  final DesktopTabController tabController;
  final bool isRDP;
  final bool? forceRelay;
  final bool? isSharedPassword;
  final String? connToken;
  final SimpleWrapper<State<PortForwardPage>?> _lastState = SimpleWrapper(null);

  FFI get ffi => (_lastState.value! as _PortForwardPageState)._ffi;

  @override
  State<PortForwardPage> createState() {
    final state = _PortForwardPageState();
    _lastState.value = state;
    return state;
  }
}

class _PortForwardPageState extends State<PortForwardPage>
    with AutomaticKeepAliveClientMixin {
  final TextEditingController localPortController = TextEditingController();
  final TextEditingController remoteHostController = TextEditingController();
  final TextEditingController remotePortController = TextEditingController();
  RxList<_PortForward> pfs = RxList.empty(growable: true);
  late FFI _ffi;

  @override
  void initState() {
    super.initState();
    _ffi = FFI(null);
    _ffi.start(widget.id,
        isPortForward: true,
        password: widget.password,
        isSharedPassword: widget.isSharedPassword,
        forceRelay: widget.forceRelay,
        connToken: widget.connToken,
        isRdp: widget.isRDP);
    Get.put<FFI>(_ffi, tag: 'pf_${widget.id}');
    debugPrint("Port forward page init success with id ${widget.id}");
    // Call onSelected in post frame callback, since we cannot guarantee that the callback will not call setState.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      widget.tabController.onSelected?.call(widget.id);
    });
  }

  @override
  void dispose() {
    _ffi.close();
    _ffi.dialogManager.dismissAll();
    Get.delete<FFI>(tag: 'pf_${widget.id}');
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return Scaffold(
      backgroundColor: DesktopHomeTheme.canvas(context),
      body: FutureBuilder(future: () async {
        if (!widget.isRDP) {
          refreshTunnelConfig();
        }
      }(), builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.done) {
          return Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _buildPageHeader(context),
                const SizedBox(height: 14),
                buildPrompt(context),
                Expanded(
                  child: Container(
                    decoration: DesktopHomeTheme.card(context),
                    clipBehavior: Clip.antiAlias,
                    child:
                        widget.isRDP ? buildRdp(context) : buildTunnel(context),
                  ),
                ),
              ],
            ),
          );
        }
        return const Offstage();
      }),
    );
  }

  Widget _buildPageHeader(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 38,
          height: 38,
          decoration: BoxDecoration(
            color: DesktopHomeTheme.brand.withOpacity(0.10),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(
            widget.isRDP
                ? Icons.desktop_windows_outlined
                : Icons.route_outlined,
            size: 19,
            color: DesktopHomeTheme.brand,
          ),
        ),
        const SizedBox(width: 11),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              translate(widget.isRDP ? 'RDP' : 'Port Forwarding'),
              style: TextStyle(
                color: DesktopHomeTheme.textPrimary(context),
                fontSize: 18,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 2),
            Text(widget.id, style: DesktopHomeTheme.caption(context)),
          ],
        ),
      ],
    );
  }

  buildPrompt(BuildContext context) {
    return Obx(() => Offstage(
          offstage: pfs.isEmpty && !widget.isRDP,
          child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
              decoration: BoxDecoration(
                color: DesktopHomeTheme.success.withOpacity(0.10),
                borderRadius:
                    BorderRadius.circular(DesktopHomeTheme.controlRadius),
                border: Border.all(
                    color: DesktopHomeTheme.success.withOpacity(0.28)),
              ),
              child: Row(children: [
                const Icon(Icons.check_circle_outline_rounded,
                    size: 18, color: DesktopHomeTheme.success),
                const SizedBox(width: 9),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(translate('Listening ...'),
                          style: TextStyle(
                              color: DesktopHomeTheme.textPrimary(context),
                              fontSize: 13,
                              fontWeight: FontWeight.w600)),
                      Text(translate('not_close_tcp_tip'),
                          style: TextStyle(
                              fontSize: 10,
                              color: DesktopHomeTheme.textSecondary(context),
                              height: 1.25)),
                    ],
                  ),
                ),
              ])).marginOnly(bottom: 10),
        ));
  }

  buildTunnel(BuildContext context) {
    text(String label) => Expanded(
        child: Text(translate(label)).marginOnly(left: _kTextLeftMargin));

    return Theme(
      data: Theme.of(context).copyWith(
        colorScheme: Theme.of(context).colorScheme,
      ),
      child: Obx(() => ListView.builder(
          controller: ScrollController(),
          itemCount: pfs.length + 2,
          itemBuilder: ((context, index) {
            if (index == 0) {
              return Container(
                height: 36,
                color: DesktopHomeTheme.surfaceMuted(context),
                child: Row(children: [
                  text('Local Port'),
                  const SizedBox(width: _kColumn1Width),
                  text('Remote Host'),
                  text('Remote Port'),
                  SizedBox(
                      width: _kColumn4Width, child: Text(translate('Action')))
                ]),
              );
            } else if (index == 1) {
              return buildTunnelAddRow(context);
            } else {
              return buildTunnelDataRow(context, pfs[index - 2], index - 2);
            }
          }))),
    );
  }

  buildTunnelAddRow(BuildContext context) {
    var portInputFormatter = [
      FilteringTextInputFormatter.allow(RegExp(
          r'^([0-9]|[1-9]\d|[1-9]\d{2}|[1-9]\d{3}|[1-5]\d{4}|6[0-4]\d{3}|65[0-4]\d{2}|655[0-2]\d|6553[0-5])$'))
    ];

    return Container(
      height: _kRowHeight,
      decoration: BoxDecoration(
        color: DesktopHomeTheme.surface(context),
        border:
            Border(bottom: BorderSide(color: DesktopHomeTheme.border(context))),
      ),
      child: Row(children: [
        buildTunnelInputCell(context,
            controller: localPortController,
            inputFormatters: portInputFormatter),
        const SizedBox(
            width: _kColumn1Width, child: Icon(Icons.arrow_forward_sharp)),
        buildTunnelInputCell(context,
            controller: remoteHostController, hint: 'localhost'),
        buildTunnelInputCell(context,
            controller: remotePortController,
            inputFormatters: portInputFormatter),
        ElevatedButton(
          onPressed: () async {
            int? localPort = int.tryParse(localPortController.text);
            int? remotePort = int.tryParse(remotePortController.text);
            if (localPort != null &&
                remotePort != null &&
                (remoteHostController.text.isEmpty ||
                    remoteHostController.text.trim().isNotEmpty)) {
              await bind.sessionAddPortForward(
                  sessionId: _ffi.sessionId,
                  localPort: localPort,
                  remoteHost: remoteHostController.text.trim().isEmpty
                      ? 'localhost'
                      : remoteHostController.text.trim(),
                  remotePort: remotePort);
              localPortController.clear();
              remoteHostController.clear();
              remotePortController.clear();
              refreshTunnelConfig();
            }
          },
          child: Text(
            translate('Add'),
          ),
        ).marginSymmetric(horizontal: 10),
      ]),
    );
  }

  buildTunnelInputCell(BuildContext context,
      {required TextEditingController controller,
      List<TextInputFormatter>? inputFormatters,
      String? hint}) {
    return Expanded(
      child: Padding(
          padding: const EdgeInsets.all(10.0),
          child: TextField(
              controller: controller,
              inputFormatters: inputFormatters,
              decoration: InputDecoration(
                hintText: hint,
              )).workaroundFreezeLinuxMint()),
    );
  }

  Widget buildTunnelDataRow(BuildContext context, _PortForward pf, int index) {
    text(String label) => Expanded(
        child: Text(label,
                style: TextStyle(
                    color: DesktopHomeTheme.textPrimary(context),
                    fontSize: 14,
                    fontWeight: FontWeight.w500))
            .marginOnly(left: _kTextLeftMargin));

    return Container(
      height: _kRowHeight,
      decoration: BoxDecoration(
        color: index % 2 == 0
            ? DesktopHomeTheme.surfaceMuted(context)
            : DesktopHomeTheme.surface(context),
        border:
            Border(bottom: BorderSide(color: DesktopHomeTheme.border(context))),
      ),
      child: Row(children: [
        text(pf.localPort.toString()),
        const SizedBox(width: _kColumn1Width),
        text(pf.remoteHost),
        text(pf.remotePort.toString()),
        SizedBox(
          width: _kColumn4Width,
          child: IconButton(
            icon: const Icon(Icons.close),
            onPressed: () async {
              await bind.sessionRemovePortForward(
                  sessionId: _ffi.sessionId, localPort: pf.localPort);
              refreshTunnelConfig();
            },
          ),
        ),
      ]),
    );
  }

  void refreshTunnelConfig() async {
    String peer = bind.mainGetPeerSync(id: widget.id);
    Map<String, dynamic> config = jsonDecode(peer);
    List<dynamic> infos = config['port_forwards'] as List;
    List<_PortForward> result = List.empty(growable: true);
    for (var e in infos) {
      result.add(_PortForward.fromJson(e));
    }
    pfs.value = result;
  }

  buildRdp(BuildContext context) {
    text1(String label) => Expanded(
        child: Text(translate(label)).marginOnly(left: _kTextLeftMargin));
    text2(String label) => Expanded(
        child: Text(label,
                style: TextStyle(
                    color: DesktopHomeTheme.textPrimary(context),
                    fontSize: 14,
                    fontWeight: FontWeight.w500))
            .marginOnly(left: _kTextLeftMargin));
    return Theme(
      data: Theme.of(context)
          .copyWith(colorScheme: Theme.of(context).colorScheme),
      child: ListView.builder(
          controller: ScrollController(),
          itemCount: 2,
          itemBuilder: ((context, index) {
            if (index == 0) {
              return Container(
                height: 36,
                color: DesktopHomeTheme.surfaceMuted(context),
                child: Row(children: [
                  text1('Local Port'),
                  const SizedBox(width: _kColumn1Width),
                  text1('Remote Host'),
                  text1('Remote Port'),
                ]),
              );
            } else {
              return Container(
                height: _kRowHeight,
                decoration: BoxDecoration(
                  color: DesktopHomeTheme.surface(context),
                  border: Border(
                      bottom:
                          BorderSide(color: DesktopHomeTheme.border(context))),
                ),
                child: Row(children: [
                  Expanded(
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: SizedBox(
                        width: 120,
                        child: ElevatedButton(
                          onPressed: () =>
                              bind.sessionNewRdp(sessionId: _ffi.sessionId),
                          child: Text(
                            translate('New RDP'),
                          ),
                        ).marginSymmetric(vertical: 10),
                      ).marginOnly(left: 20),
                    ),
                  ),
                  const SizedBox(
                      width: _kColumn1Width,
                      child: Icon(Icons.arrow_forward_sharp)),
                  text2('localhost'),
                  text2('RDP'),
                ]),
              );
            }
          })),
    );
  }

  @override
  bool get wantKeepAlive => true;
}
