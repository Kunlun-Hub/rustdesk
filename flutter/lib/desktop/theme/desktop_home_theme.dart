import 'package:flutter/material.dart';

/// Visual tokens for the RustDesk desktop home experience.
///
/// Keep these values local to the desktop shell while the refreshed visual
/// language is rolled out. Remote-session windows and mobile screens continue
/// to use the existing application theme.
class DesktopHomeTheme {
  DesktopHomeTheme._();

  static const Color brand = Color(0xFF1677FF);
  static const Color brandHover = Color(0xFF0B68E8);
  static const Color success = Color(0xFF24B47E);
  static const Color warning = Color(0xFFF5A524);

  static const double navigationWidth = 288;
  static const double radius = 14;
  static const double controlRadius = 10;

  static bool isDark(BuildContext context) =>
      Theme.of(context).brightness == Brightness.dark;

  static Color canvas(BuildContext context) =>
      isDark(context) ? const Color(0xFF111318) : const Color(0xFFF5F7FA);

  static Color navigation(BuildContext context) =>
      isDark(context) ? const Color(0xFF171A21) : const Color(0xFFFFFFFF);

  static Color surface(BuildContext context) =>
      isDark(context) ? const Color(0xFF1D212A) : const Color(0xFFFFFFFF);

  static Color surfaceMuted(BuildContext context) =>
      isDark(context) ? const Color(0xFF242A35) : const Color(0xFFF5F7FA);

  static Color border(BuildContext context) =>
      isDark(context) ? const Color(0xFF303744) : const Color(0xFFE4E8EF);

  static Color textPrimary(BuildContext context) =>
      isDark(context) ? const Color(0xFFF4F6F8) : const Color(0xFF172033);

  static Color textSecondary(BuildContext context) =>
      isDark(context) ? const Color(0xFF9CA6B6) : const Color(0xFF6D7788);

  static BoxDecoration card(BuildContext context, {Color? color}) =>
      BoxDecoration(
        color: color ?? surface(context),
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(color: border(context)),
      );

  static TextStyle sectionTitle(BuildContext context) => TextStyle(
        color: textPrimary(context),
        fontSize: 16,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.1,
      );

  static TextStyle caption(BuildContext context) => TextStyle(
        color: textSecondary(context),
        fontSize: 12,
        fontWeight: FontWeight.w500,
      );
}
