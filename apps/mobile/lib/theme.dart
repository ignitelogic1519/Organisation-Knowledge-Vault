import 'package:flutter/material.dart';

/// Brand tokens mirrored from the web design system (globals.css).
const Color kvAccent = Color(0xFF5B5BF0); // --accent
const Color kvAccent2 = Color(0xFFA24BF5); // --accent-2
const Color kvBg = Color(0xFF0B0B14); // dark app background

const LinearGradient kvGradient = LinearGradient(
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
  colors: [kvAccent, kvAccent2],
);

ThemeData buildTheme() {
  return ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    scaffoldBackgroundColor: kvBg,
    colorScheme: ColorScheme.fromSeed(
      seedColor: kvAccent,
      brightness: Brightness.dark,
    ),
  );
}
