import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'theme.dart';
import 'webview_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
      systemNavigationBarColor: kvBg,
    ),
  );
  runApp(const KnowledgeVaultApp());
}

class KnowledgeVaultApp extends StatelessWidget {
  const KnowledgeVaultApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Knowledge Vault',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      home: const WebViewScreen(),
    );
  }
}
