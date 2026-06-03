// main window right pane

import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_hbb/consts.dart';
import 'package:flutter_hbb/models/state_model.dart';
import 'package:get/get.dart';
import 'package:url_launcher/url_launcher_string.dart';
import 'package:window_manager/window_manager.dart';
import 'package:flutter_hbb/models/peer_model.dart';

import '../../common.dart';
import '../../common/formatter/id_formatter.dart';
import '../../common/widgets/autocomplete.dart';
import '../../models/platform_model.dart';

const _assistBg = Color(0xFF141519);
const _assistControlBg = Color(0xFF17181D);
const _assistInputBg = Color(0xFF17181D);
const _assistInputBorder = Color(0xFF454750);
const _assistText = Color(0xFFF4F5F8);
const _assistMuted = Color(0xFF8D9099);
const _assistAccent = Color(0xFF2F74FF);
const _assistButton = Color(0xFF233E77);

class OnlineStatusWidget extends StatefulWidget {
  const OnlineStatusWidget({Key? key, this.onSvcStatusChanged})
      : super(key: key);

  final VoidCallback? onSvcStatusChanged;

  @override
  State<OnlineStatusWidget> createState() => _OnlineStatusWidgetState();
}

/// State for the connection page.
class _OnlineStatusWidgetState extends State<OnlineStatusWidget> {
  final _svcStopped = Get.find<RxBool>(tag: 'stop-service');
  final _svcIsUsingPublicServer = true.obs;
  Timer? _updateTimer;

  double get em => 14.0;
  double? get height => bind.isIncomingOnly() ? null : em * 3;

  void onUsePublicServerGuide() {
    const url = "https://rustdesk.com/pricing";
    canLaunchUrlString(url).then((can) {
      if (can) {
        launchUrlString(url);
      }
    });
  }

  @override
  void initState() {
    super.initState();
    _updateTimer = periodic_immediate(Duration(seconds: 1), () async {
      updateStatus();
    });
  }

  @override
  void dispose() {
    _updateTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isIncomingOnly = bind.isIncomingOnly();
    final hideServerSettings =
        bind.mainGetBuildinOption(key: kOptionHideServerSetting) == 'Y';
    startServiceWidget() => Offstage(
          offstage: !_svcStopped.value,
          child: InkWell(
                  onTap: () async {
                    await start_service(true);
                  },
                  child: Text(translate("Start service"),
                      style: TextStyle(
                          decoration: TextDecoration.underline, fontSize: em)))
              .marginOnly(left: em),
        );

    setupServerWidget() => Flexible(
          child: Offstage(
            offstage: !(!hideServerSettings &&
                !_svcStopped.value &&
                stateGlobal.svcStatus.value == SvcStatus.ready &&
                _svcIsUsingPublicServer.value),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Text(', ', style: TextStyle(fontSize: em)),
                Flexible(
                  child: InkWell(
                    onTap: onUsePublicServerGuide,
                    child: Row(
                      children: [
                        Flexible(
                          child: Text(
                            translate('setup_server_tip'),
                            style: TextStyle(
                                decoration: TextDecoration.underline,
                                fontSize: em),
                          ),
                        ),
                      ],
                    ),
                  ),
                )
              ],
            ),
          ),
        );

    basicWidget() => Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Container(
              height: 8,
              width: 8,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(4),
                color: _svcStopped.value ||
                        stateGlobal.svcStatus.value == SvcStatus.connecting
                    ? kColorWarn
                    : (stateGlobal.svcStatus.value == SvcStatus.ready
                        ? Color.fromARGB(255, 50, 190, 166)
                        : Color.fromARGB(255, 224, 79, 95)),
              ),
            ).marginSymmetric(horizontal: em),
            Container(
              width: isIncomingOnly ? 226 : null,
              child: _buildConnStatusMsg(),
            ),
            // stop
            if (!isIncomingOnly) startServiceWidget(),
            // ready && public
            // No need to show the guide if is custom client.
            if (!isIncomingOnly) setupServerWidget(),
          ],
        );

    return Container(
      height: height,
      child: Obx(() => isIncomingOnly
          ? Column(
              children: [
                basicWidget(),
                Align(
                        child: startServiceWidget(),
                        alignment: Alignment.centerLeft)
                    .marginOnly(top: 2.0, left: 22.0),
              ],
            )
          : basicWidget()),
    ).paddingOnly(right: isIncomingOnly ? 8 : 0);
  }

  _buildConnStatusMsg() {
    widget.onSvcStatusChanged?.call();
    return Text(
      _svcStopped.value
          ? translate("Service is not running")
          : stateGlobal.svcStatus.value == SvcStatus.connecting
              ? translate("connecting_status")
              : stateGlobal.svcStatus.value == SvcStatus.notReady
                  ? translate("not_ready_status")
                  : translate('Ready'),
      style: TextStyle(fontSize: em),
    );
  }

  updateStatus() async {
    final status =
        jsonDecode(await bind.mainGetConnectStatus()) as Map<String, dynamic>;
    final statusNum = status['status_num'] as int;
    if (statusNum == 0) {
      stateGlobal.svcStatus.value = SvcStatus.connecting;
    } else if (statusNum == -1) {
      stateGlobal.svcStatus.value = SvcStatus.notReady;
    } else if (statusNum == 1) {
      stateGlobal.svcStatus.value = SvcStatus.ready;
    } else {
      stateGlobal.svcStatus.value = SvcStatus.notReady;
    }
    _svcIsUsingPublicServer.value = await bind.mainIsUsingPublicServer();
    try {
      stateGlobal.videoConnCount.value = status['video_conn_count'] as int;
    } catch (_) {}
  }
}

/// Connection page for connecting to a remote peer.
class ConnectionPage extends StatefulWidget {
  const ConnectionPage({Key? key}) : super(key: key);

  @override
  State<ConnectionPage> createState() => _ConnectionPageState();
}

/// State for the connection page.
class _ConnectionPageState extends State<ConnectionPage>
    with SingleTickerProviderStateMixin, WindowListener {
  /// Controller for the id input bar.
  final _idController = IDTextEditingController();

  final RxBool _idInputFocused = false.obs;
  final FocusNode _idFocusNode = FocusNode();
  final TextEditingController _idEditingController = TextEditingController();
  final TextEditingController _passwordEditingController =
      TextEditingController();

  String selectedConnectionType = 'remoteDesktop';

  bool isWindowMinimized = false;

  final AllPeersLoader _allPeersLoader = AllPeersLoader();

  // https://github.com/flutter/flutter/issues/157244
  Iterable<Peer> _autocompleteOpts = [];

  @override
  void initState() {
    super.initState();
    _allPeersLoader.init(setState);
    Future.delayed(Duration.zero, () => _allPeersLoader.getAllPeers());
    _idFocusNode.addListener(onFocusChanged);
    if (_idController.text.isEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) async {
        final lastRemoteId = await bind.mainGetLastRemoteId();
        if (lastRemoteId != _idController.id) {
          setState(() {
            _idController.id = lastRemoteId;
          });
        }
      });
    }
    Get.put<TextEditingController>(_idEditingController);
    Get.put<IDTextEditingController>(_idController);
    windowManager.addListener(this);
  }

  @override
  void dispose() {
    _idController.dispose();
    windowManager.removeListener(this);
    _allPeersLoader.clear();
    _idFocusNode.removeListener(onFocusChanged);
    _idFocusNode.dispose();
    _idEditingController.dispose();
    _passwordEditingController.dispose();
    if (Get.isRegistered<IDTextEditingController>()) {
      Get.delete<IDTextEditingController>();
    }
    if (Get.isRegistered<TextEditingController>()) {
      Get.delete<TextEditingController>();
    }
    super.dispose();
  }

  @override
  void onWindowEvent(String eventName) {
    super.onWindowEvent(eventName);
    if (eventName == 'minimize') {
      isWindowMinimized = true;
    } else if (eventName == 'maximize' || eventName == 'restore') {
      if (isWindowMinimized && isWindows) {
        // windows can't update when minimized.
        Get.forceAppUpdate();
      }
      isWindowMinimized = false;
    }
  }

  @override
  void onWindowEnterFullScreen() {
    // Remove edge border by setting the value to zero.
    stateGlobal.resizeEdgeSize.value = 0;
  }

  @override
  void onWindowLeaveFullScreen() {
    // Restore edge border to default edge size.
    stateGlobal.resizeEdgeSize.value = stateGlobal.isMaximized.isTrue
        ? kMaximizeEdgeSize
        : windowResizeEdgeSize;
  }

  @override
  void onWindowClose() {
    super.onWindowClose();
    bind.mainOnMainWindowClose();
  }

  void onFocusChanged() {
    _idInputFocused.value = _idFocusNode.hasFocus;
    if (_idFocusNode.hasFocus) {
      if (_allPeersLoader.needLoad) {
        _allPeersLoader.getAllPeers();
      }

      final textLength = _idEditingController.value.text.length;
      // Select all to facilitate removing text, just following the behavior of address input of chrome.
      _idEditingController.selection =
          TextSelection(baseOffset: 0, extentOffset: textLength);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isOutgoingOnly = bind.isOutgoingOnly();
    return Container(
      color: _assistBg,
      child: Column(
        children: [
          Expanded(
            child: Align(
              alignment: Alignment.topCenter,
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 594),
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(0, 38, 0, 24),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (!isOutgoingOnly) _buildLocalAssistPanel(context),
                      const SizedBox(height: 34),
                      _buildRemoteAssistPanel(context),
                      const SizedBox(height: 28),
                      _buildQuickPeerCard(context),
                    ],
                  ),
                ),
              ),
            ),
          ),
          if (!isOutgoingOnly) OnlineStatusWidget()
        ],
      ),
    );
  }

  /// Callback for the connect button.
  /// Connects to the selected peer.
  void onConnect(
      {bool isFileTransfer = false,
      bool isViewCamera = false,
      bool isTerminal = false}) {
    var id = _idController.id;
    final password = _passwordEditingController.text.trim();
    connect(context, id,
        isFileTransfer:
            isFileTransfer || selectedConnectionType == 'remoteFile',
        isViewCamera: isViewCamera,
        isTerminal: isTerminal,
        password: password.isEmpty ? null : password);
  }

  Widget _buildLocalAssistPanel(BuildContext context) {
    final model = gFFI.serverModel;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Text(
              '远程协助本机',
              style: TextStyle(
                color: _assistText,
                fontSize: 23,
                fontWeight: FontWeight.w500,
              ),
            ),
            const SizedBox(width: 12),
            _buildServiceSwitch(),
            const SizedBox(width: 12),
            Container(
              height: 25,
              width: 42,
              decoration: BoxDecoration(
                color: _assistControlBg,
                borderRadius: BorderRadius.circular(14),
              ),
              child: const Center(
                child: Icon(Icons.desktop_windows_outlined,
                    color: Color(0xFF6E7178), size: 17),
              ),
            ),
          ],
        ),
        const SizedBox(height: 26),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: _buildReadOnlyValue(
                label: '本机识别码',
                controller: model.serverId,
                valueStyle: const TextStyle(
                  color: _assistText,
                  fontSize: 34,
                  height: 1.05,
                  letterSpacing: 0,
                ),
                onCopy: () {
                  Clipboard.setData(ClipboardData(text: model.serverId.text));
                  showToast(translate('Copied'));
                },
              ),
            ),
            const SizedBox(width: 92),
            Expanded(
              child: _buildReadOnlyValue(
                label: '单次验证码⌄',
                controller: model.serverPasswd,
                obscure: true,
                valueStyle: const TextStyle(
                  color: Color(0xFF595B62),
                  fontSize: 30,
                  height: 1.05,
                  letterSpacing: 6,
                ),
                onCopy: () {
                  Clipboard.setData(
                      ClipboardData(text: model.serverPasswd.text));
                  showToast(translate('Copied'));
                },
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildServiceSwitch() {
    if (!Get.isRegistered<RxBool>(tag: 'stop-service')) {
      return const SizedBox();
    }
    final svcStopped = Get.find<RxBool>(tag: 'stop-service');
    return Obx(() {
      final enabled = !svcStopped.value;
      return InkWell(
        onTap: () => start_service(!enabled),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          width: 42,
          height: 25,
          padding: const EdgeInsets.all(3),
          decoration: BoxDecoration(
            color: enabled ? _assistAccent : _assistControlBg,
            borderRadius: BorderRadius.circular(14),
          ),
          child: Align(
            alignment: enabled ? Alignment.centerRight : Alignment.centerLeft,
            child: Container(
              width: 19,
              height: 19,
              decoration: const BoxDecoration(
                color: Colors.white,
                shape: BoxShape.circle,
              ),
            ),
          ),
        ),
      );
    });
  }

  Widget _buildReadOnlyValue({
    required String label,
    required TextEditingController controller,
    required TextStyle valueStyle,
    bool obscure = false,
    VoidCallback? onCopy,
  }) {
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        final raw = controller.text.trim();
        final value =
            obscure ? (raw.isEmpty || raw == '-' ? '••••••' : '••••••') : raw;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label,
                style: const TextStyle(
                    color: _assistMuted, fontSize: 14, height: 1.4)),
            const SizedBox(height: 9),
            Row(
              children: [
                Expanded(
                  child: Text(
                    value,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: valueStyle,
                  ),
                ),
                InkWell(
                  onTap: onCopy,
                  child: const Icon(Icons.copy_outlined,
                      color: _assistMuted, size: 15),
                ),
              ],
            ),
          ],
        );
      },
    );
  }

  Widget _buildRemoteAssistPanel(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          '远程协助他人',
          style: TextStyle(
            color: _assistText,
            fontSize: 23,
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(height: 24),
        Row(
          children: [
            Expanded(flex: 5, child: _buildRemoteIDTextField(context)),
            const SizedBox(width: 8),
            Expanded(
              flex: 4,
              child: _buildPasswordField(),
            ),
            const SizedBox(width: 12),
            SizedBox(
              width: 190,
              height: 44,
              child: ElevatedButton(
                onPressed: onConnect,
                style: ElevatedButton.styleFrom(
                  backgroundColor: _assistButton,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(5),
                  ),
                  elevation: 0,
                ),
                child: const Text('连接',
                    style: TextStyle(color: Colors.white, fontSize: 14)),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        _buildConnectionTypeOptions(),
      ],
    );
  }

  /// UI for the remote ID TextField.
  /// Search for a peer.
  Widget _buildRemoteIDTextField(BuildContext context) {
    return RawAutocomplete<Peer>(
      optionsBuilder: (TextEditingValue textEditingValue) {
        if (textEditingValue.text == '') {
          _autocompleteOpts = const Iterable<Peer>.empty();
        } else if (_allPeersLoader.peers.isEmpty &&
            !_allPeersLoader.isPeersLoaded) {
          _autocompleteOpts = [Peer.loading()];
        } else {
          String textWithoutSpaces = textEditingValue.text.replaceAll(" ", "");
          if (int.tryParse(textWithoutSpaces) != null) {
            textEditingValue = TextEditingValue(
              text: textWithoutSpaces,
              selection: textEditingValue.selection,
            );
          }
          String textToFind = textEditingValue.text.toLowerCase();
          _autocompleteOpts = _allPeersLoader.peers
              .where((peer) =>
                  peer.id.toLowerCase().contains(textToFind) ||
                  peer.username.toLowerCase().contains(textToFind) ||
                  peer.hostname.toLowerCase().contains(textToFind) ||
                  peer.alias.toLowerCase().contains(textToFind))
              .toList();
        }
        return _autocompleteOpts;
      },
      focusNode: _idFocusNode,
      textEditingController: _idEditingController,
      fieldViewBuilder: (
        BuildContext context,
        TextEditingController fieldTextEditingController,
        FocusNode fieldFocusNode,
        VoidCallback onFieldSubmitted,
      ) {
        updateTextAndPreserveSelection(
            fieldTextEditingController, _idController.text);
        return Obx(() => TextField(
              autocorrect: false,
              enableSuggestions: false,
              keyboardType: TextInputType.visiblePassword,
              focusNode: fieldFocusNode,
              style: const TextStyle(color: _assistText, fontSize: 14),
              maxLines: 1,
              cursorColor: _assistAccent,
              decoration: InputDecoration(
                filled: true,
                fillColor: _assistInputBg,
                counterText: '',
                hintText: _idInputFocused.value ? null : '请输入伙伴识别码',
                hintStyle: const TextStyle(color: _assistMuted, fontSize: 14),
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 13, vertical: 13),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(5),
                  borderSide: const BorderSide(color: _assistInputBorder),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(5),
                  borderSide: const BorderSide(color: _assistAccent),
                ),
              ),
              controller: fieldTextEditingController,
              inputFormatters: [IDTextInputFormatter()],
              onChanged: (v) {
                _idController.id = v;
              },
              onSubmitted: (_) {
                onConnect();
              },
            ).workaroundFreezeLinuxMint());
      },
      onSelected: (option) {
        setState(() {
          _idController.id = option.id;
          FocusScope.of(context).unfocus();
        });
      },
      optionsViewBuilder: (BuildContext context,
          AutocompleteOnSelected<Peer> onSelected, Iterable<Peer> options) {
        options = _autocompleteOpts;
        final maxHeight = (options.length * 50.0).clamp(0.0, 200.0);

        return Align(
          alignment: Alignment.topLeft,
          child: Container(
            decoration: BoxDecoration(
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.35),
                  blurRadius: 8,
                  spreadRadius: 1,
                ),
              ],
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(5),
              child: Material(
                color: _assistControlBg,
                elevation: 4,
                child: ConstrainedBox(
                  constraints: BoxConstraints(
                    maxHeight: maxHeight,
                    maxWidth: 319,
                  ),
                  child: _allPeersLoader.peers.isEmpty &&
                          !_allPeersLoader.isPeersLoaded
                      ? const SizedBox(
                          height: 80,
                          child: Center(
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                        )
                      : Padding(
                          padding: const EdgeInsets.only(top: 5),
                          child: ListView(
                            children: options
                                .map((peer) => AutocompletePeerTile(
                                    onSelect: () => onSelected(peer),
                                    peer: peer))
                                .toList(),
                          ),
                        ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _buildPasswordField() {
    return TextField(
      controller: _passwordEditingController,
      autocorrect: false,
      enableSuggestions: false,
      keyboardType: TextInputType.visiblePassword,
      style: const TextStyle(color: _assistText, fontSize: 14),
      maxLines: 1,
      cursorColor: _assistAccent,
      decoration: InputDecoration(
        filled: true,
        fillColor: _assistInputBg,
        hintText: '验证码（可为空）',
        hintStyle: const TextStyle(color: _assistMuted, fontSize: 14),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 13, vertical: 13),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(5),
          borderSide: const BorderSide(color: _assistInputBorder),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(5),
          borderSide: const BorderSide(color: _assistAccent),
        ),
      ),
      onSubmitted: (_) => onConnect(),
    ).workaroundFreezeLinuxMint();
  }

  Widget _buildConnectionTypeOptions() {
    return Row(
      children: [
        _buildModeRadio('remoteDesktop', '远程桌面'),
        const SizedBox(width: 28),
        _buildModeRadio('remoteFile', '远程文件'),
      ],
    );
  }

  Widget _buildModeRadio(String value, String label) {
    final selected = selectedConnectionType == value;
    return InkWell(
      onTap: () => setState(() => selectedConnectionType = value),
      child: Row(
        children: [
          Radio<String>(
            value: value,
            groupValue: selectedConnectionType,
            activeColor: _assistAccent,
            onChanged: (next) {
              if (next != null) {
                setState(() => selectedConnectionType = next);
              }
            },
          ),
          Text(
            label,
            style: TextStyle(
              color: selected ? _assistText : _assistMuted,
              fontSize: 14,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildQuickPeerCard(BuildContext context) {
    if (!gFFI.userModel.isLogin || _allPeersLoader.peers.isEmpty) {
      return const SizedBox();
    }
    final peer = _allPeersLoader.peers.first;
    final label = peer.alias.isNotEmpty
        ? peer.alias
        : (peer.hostname.isNotEmpty ? peer.hostname : peer.id);
    return Center(
      child: InkWell(
        onTap: () => connect(context, peer.id),
        child: Container(
          width: 190,
          height: 88,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(6),
            gradient: const LinearGradient(
              colors: [Color(0xFF6C83FF), Color(0xFF5A28D7)],
            ),
          ),
          padding: const EdgeInsets.fromLTRB(12, 10, 10, 12),
          child: Stack(
            children: [
              Positioned(
                left: -8,
                top: -10,
                child: Icon(Icons.play_arrow_rounded,
                    color: Colors.white.withOpacity(0.12), size: 74),
              ),
              const Positioned(
                right: 0,
                top: 0,
                child:
                    Icon(Icons.favorite_border, color: Colors.white, size: 17),
              ),
              Positioned(
                left: 0,
                bottom: 0,
                right: 24,
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: Colors.white, fontSize: 14),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
