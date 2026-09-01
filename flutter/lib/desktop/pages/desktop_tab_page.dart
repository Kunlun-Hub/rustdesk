import 'package:flutter/material.dart';
import 'package:flutter_hbb/common.dart';
import 'package:flutter_hbb/common/widgets/peer_tab_page.dart';
import 'package:flutter_hbb/consts.dart';
import 'package:flutter_hbb/desktop/pages/desktop_home_page.dart';
import 'package:flutter_hbb/desktop/pages/desktop_setting_page.dart';
import 'package:flutter_hbb/desktop/theme/desktop_home_theme.dart';
import 'package:flutter_hbb/desktop/widgets/tabbar_widget.dart';
import 'package:flutter_hbb/desktop/widgets/sidebar_service_status.dart';
import 'package:flutter_hbb/models/platform_model.dart';
import 'package:flutter_hbb/models/peer_tab_model.dart';
import 'package:flutter_hbb/models/state_model.dart';
import 'package:get/get.dart';
import 'package:window_manager/window_manager.dart';
// import 'package:flutter/services.dart';

import '../../common/shared_state.dart';

class DesktopTabPage extends StatefulWidget {
  const DesktopTabPage({Key? key}) : super(key: key);

  @override
  State<DesktopTabPage> createState() => _DesktopTabPageState();

  static void onAddSetting(
      {SettingsTabKey initialPage = SettingsTabKey.general}) {
    try {
      DesktopTabController tabController = Get.find<DesktopTabController>();
      tabController.add(TabInfo(
          key: kTabLabelSettingPage,
          label: kTabLabelSettingPage,
          selectedIcon: Icons.build_sharp,
          unselectedIcon: Icons.build_outlined,
          page: DesktopSettingPage(
            key: const ValueKey(kTabLabelSettingPage),
            initialTabkey: initialPage,
          )));
    } catch (e) {
      debugPrintStack(label: '$e');
    }
  }
}

class _DesktopTabPageState extends State<DesktopTabPage> {
  final tabController = DesktopTabController(tabType: DesktopTabType.main);

  _DesktopTabPageState() {
    RemoteCountState.init();
    Get.put<DesktopTabController>(tabController);
    tabController.add(TabInfo(
        key: kTabLabelHomePage,
        label: kTabLabelHomePage,
        selectedIcon: Icons.home_sharp,
        unselectedIcon: Icons.home_outlined,
        closable: false,
        page: DesktopHomePage(
          key: const ValueKey(kTabLabelHomePage),
        )));
    if (bind.isIncomingOnly()) {
      tabController.onSelected = (key) {
        if (key == kTabLabelHomePage) {
          windowManager.setSize(getIncomingOnlyHomeSize());
          setResizable(false);
        } else {
          windowManager.setSize(getIncomingOnlySettingsSize());
          setResizable(true);
        }
      };
    }
  }

  @override
  void initState() {
    super.initState();
    // HardwareKeyboard.instance.addHandler(_handleKeyEvent);
  }

  /*
  bool _handleKeyEvent(KeyEvent event) {
    if (!mouseIn && event is KeyDownEvent) {
      print('key down: ${event.logicalKey}');
      shouldBeBlocked(_block, canBeBlocked);
    }
    return false; // allow it to propagate
  }
  */

  @override
  void dispose() {
    // HardwareKeyboard.instance.removeHandler(_handleKeyEvent);
    Get.delete<DesktopTabController>();

    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final tabWidget = Container(
        child: Scaffold(
            backgroundColor: Theme.of(context).colorScheme.background,
            body: DesktopTab(
              controller: tabController,
              showMaximize: false,
              hideTabStrip: !bind.isIncomingOnly(),
              pageViewBuilder: bind.isIncomingOnly()
                  ? null
                  : (pageView) => _buildPrimaryShell(context, pageView),
            )));
    return isMacOS || kUseCompatibleUiMode
        ? tabWidget
        : Obx(
            () => DragToResizeArea(
              resizeEdgeSize: stateGlobal.resizeEdgeSize.value,
              enableResizeEdges: windowManagerEnableResizeEdges,
              child: tabWidget,
            ),
          );
  }

  Widget _buildPrimaryShell(BuildContext context, Widget pageView) {
    return LayoutBuilder(builder: (context, constraints) {
      final compact = constraints.maxWidth < 940;
      return Row(
        children: [
          _DesktopPrimaryNavigation(
              controller: tabController, compact: compact),
          VerticalDivider(
            width: 1,
            thickness: 1,
            color: DesktopHomeTheme.border(context),
          ),
          Expanded(child: pageView),
        ],
      );
    });
  }
}

class _DesktopPrimaryNavigation extends StatelessWidget {
  const _DesktopPrimaryNavigation({
    required this.controller,
    required this.compact,
  });

  final DesktopTabController controller;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: compact ? 64 : DesktopHomeTheme.primaryNavigationWidth,
      color: DesktopHomeTheme.navigation(context),
      child: Column(
        children: [
          Padding(
            padding: EdgeInsets.fromLTRB(14, 18, compact ? 14 : 12, 16),
            child: Row(
              children: [
                Container(
                  width: 36,
                  height: 36,
                  padding: const EdgeInsets.all(7),
                  decoration: BoxDecoration(
                    color: DesktopHomeTheme.brand.withOpacity(0.10),
                    borderRadius: BorderRadius.circular(11),
                  ),
                  child: loadIcon(22),
                ),
                if (!compact) ...[
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      bind.mainGetAppNameSync(),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: DesktopHomeTheme.textPrimary(context),
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
          Obx(() {
            final selectedKey = controller.state.value.selectedTabInfo.key;
            return AnimatedBuilder(
              animation: gFFI.peerTabModel,
              builder: (context, _) => _PrimaryNavigationItem(
                label: translate('Remote Control'),
                icon: Icons.desktop_windows_outlined,
                compact: compact,
                selected: selectedKey == kTabLabelHomePage &&
                    gFFI.peerTabModel.currentTab != PeerTabIndex.ab.index &&
                    gFFI.peerTabModel.currentTab != PeerTabIndex.group.index,
                onTap: () {
                  controller.jumpToByKey(kTabLabelHomePage);
                  selectPeerTab(PeerTabIndex.recent.index);
                },
              ),
            );
          }),
          if (gFFI.peerTabModel.isEnabled[PeerTabIndex.ab.index])
            Obx(() {
              final selectedKey = controller.state.value.selectedTabInfo.key;
              return AnimatedBuilder(
                animation: gFFI.peerTabModel,
                builder: (context, _) => _PrimaryNavigationItem(
                  label: translate('Address book'),
                  icon: IconFont.addressBook,
                  compact: compact,
                  selected: selectedKey == kTabLabelHomePage &&
                      gFFI.peerTabModel.currentTab == PeerTabIndex.ab.index,
                  onTap: () {
                    controller.jumpToByKey(kTabLabelHomePage);
                    selectPeerTab(PeerTabIndex.ab.index);
                  },
                ),
              );
            }),
          if (gFFI.peerTabModel.isEnabled[PeerTabIndex.group.index])
            Obx(() {
              final selectedKey = controller.state.value.selectedTabInfo.key;
              return AnimatedBuilder(
                animation: gFFI.peerTabModel,
                builder: (context, _) => _PrimaryNavigationItem(
                  label: translate('Accessible devices'),
                  icon: IconFont.deviceGroupFill,
                  compact: compact,
                  selected: selectedKey == kTabLabelHomePage &&
                      gFFI.peerTabModel.currentTab == PeerTabIndex.group.index,
                  onTap: () {
                    controller.jumpToByKey(kTabLabelHomePage);
                    selectPeerTab(PeerTabIndex.group.index);
                  },
                ),
              );
            }),
          const Spacer(),
          SidebarServiceStatus(compact: compact),
          const SizedBox(height: 2),
          if (!bind.isDisableSettings())
            Obx(() {
              final selectedKey = controller.state.value.selectedTabInfo.key;
              return _PrimaryNavigationItem(
                label: translate('Settings'),
                icon: Icons.settings_outlined,
                compact: compact,
                selected: selectedKey == kTabLabelSettingPage,
                onTap: DesktopTabPage.onAddSetting,
              );
            }),
          const SizedBox(height: 12),
        ],
      ),
    );
  }
}

class _PrimaryNavigationItem extends StatelessWidget {
  const _PrimaryNavigationItem({
    required this.label,
    required this.icon,
    required this.compact,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final bool compact;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = selected
        ? DesktopHomeTheme.brand
        : DesktopHomeTheme.textSecondary(context);
    final content = Padding(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
      child: Material(
        color: selected
            ? DesktopHomeTheme.brand.withOpacity(0.10)
            : Colors.transparent,
        borderRadius: BorderRadius.circular(DesktopHomeTheme.controlRadius),
        child: InkWell(
          borderRadius: BorderRadius.circular(DesktopHomeTheme.controlRadius),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
            child: Row(
              mainAxisAlignment:
                  compact ? MainAxisAlignment.center : MainAxisAlignment.start,
              children: [
                Icon(icon, size: 18, color: color),
                if (!compact) ...[
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: selected
                            ? DesktopHomeTheme.textPrimary(context)
                            : color,
                        fontSize: 13,
                        fontWeight:
                            selected ? FontWeight.w600 : FontWeight.w500,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
    return compact ? Tooltip(message: label, child: content) : content;
  }
}
