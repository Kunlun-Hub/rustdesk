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

  static ThemeData settingsTheme(BuildContext context) {
    final base = Theme.of(context);
    final muted = surfaceMuted(context);
    final outline = border(context);
    final secondary = textSecondary(context);
    final primary = textPrimary(context);

    return base.copyWith(
      hoverColor: brand.withOpacity(0.06),
      focusColor: brand.withOpacity(0.08),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: muted,
        isDense: true,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        hintStyle: TextStyle(color: secondary, fontSize: 13),
        labelStyle: TextStyle(color: secondary, fontSize: 13),
        prefixIconColor: secondary,
        suffixIconColor: secondary,
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(controlRadius),
          borderSide: BorderSide(color: outline),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(controlRadius),
          borderSide: const BorderSide(color: brand, width: 1.4),
        ),
        disabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(controlRadius),
          borderSide: BorderSide(color: outline.withOpacity(0.65)),
        ),
      ),
      checkboxTheme: CheckboxThemeData(
        visualDensity: const VisualDensity(horizontal: -3, vertical: -3),
        materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(5)),
        side: BorderSide(color: secondary, width: 1.2),
        fillColor: MaterialStateProperty.resolveWith((states) {
          if (states.contains(MaterialState.disabled)) {
            return secondary.withOpacity(0.20);
          }
          if (states.contains(MaterialState.selected)) return brand;
          return Colors.transparent;
        }),
        checkColor: const MaterialStatePropertyAll(Colors.white),
      ),
      radioTheme: RadioThemeData(
        visualDensity: const VisualDensity(horizontal: -3, vertical: -3),
        materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
        fillColor: MaterialStateProperty.resolveWith((states) {
          if (states.contains(MaterialState.disabled)) {
            return secondary.withOpacity(0.35);
          }
          if (states.contains(MaterialState.selected)) return brand;
          return secondary;
        }),
      ),
      switchTheme: SwitchThemeData(
        materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
        trackOutlineColor: const MaterialStatePropertyAll(Colors.transparent),
        thumbColor: MaterialStateProperty.resolveWith((states) {
          if (states.contains(MaterialState.disabled)) {
            return secondary.withOpacity(0.55);
          }
          return Colors.white;
        }),
        trackColor: MaterialStateProperty.resolveWith((states) {
          if (states.contains(MaterialState.disabled)) {
            return secondary.withOpacity(0.16);
          }
          if (states.contains(MaterialState.selected)) return brand;
          return secondary.withOpacity(0.28);
        }),
      ),
      sliderTheme: base.sliderTheme.copyWith(
        activeTrackColor: brand,
        inactiveTrackColor: outline,
        thumbColor: brand,
        overlayColor: brand.withOpacity(0.10),
        trackHeight: 3,
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(
        color: brand,
        linearTrackColor: outline,
        circularTrackColor: outline,
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          elevation: 0,
          backgroundColor: brand,
          foregroundColor: Colors.white,
          minimumSize: const Size(0, 36),
          padding: const EdgeInsets.symmetric(horizontal: 16),
          textStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(controlRadius)),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          elevation: 0,
          backgroundColor: surface(context),
          foregroundColor: primary,
          minimumSize: const Size(0, 36),
          padding: const EdgeInsets.symmetric(horizontal: 16),
          side: BorderSide(color: outline),
          textStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(controlRadius)),
        ),
      ),
      popupMenuTheme: base.popupMenuTheme.copyWith(
        color: surface(context),
        elevation: 8,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(controlRadius),
          side: BorderSide(color: outline),
        ),
      ),
      listTileTheme: base.listTileTheme.copyWith(
        dense: true,
        minVerticalPadding: 8,
        minLeadingWidth: 20,
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
        iconColor: secondary,
        textColor: primary,
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(controlRadius)),
        selectedTileColor: brand.withOpacity(0.08),
        selectedColor: brand,
      ),
      dropdownMenuTheme: DropdownMenuThemeData(
        textStyle: TextStyle(color: primary, fontSize: 13),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: muted,
          isDense: true,
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(controlRadius),
            borderSide: BorderSide(color: outline),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(controlRadius),
            borderSide: const BorderSide(color: brand, width: 1.4),
          ),
        ),
        menuStyle: MenuStyle(
          backgroundColor: MaterialStatePropertyAll(surface(context)),
          elevation: const MaterialStatePropertyAll(8),
          shape: MaterialStatePropertyAll(RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(controlRadius),
            side: BorderSide(color: outline),
          )),
        ),
      ),
      textTheme: base.textTheme.copyWith(
        bodyMedium: base.textTheme.bodyMedium?.copyWith(
          color: primary,
          fontSize: 13,
        ),
      ),
    );
  }
}
