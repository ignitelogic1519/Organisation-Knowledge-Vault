/// App configuration.
class AppConfig {
  /// The deployed web app the native shell loads. Because the shell simply
  /// renders this site, ANY change you ship to the web app appears in the APK
  /// on the next launch — no mobile rebuild required.
  ///
  /// Point it at your real deployment either by editing the default below, or
  /// at build time without touching code:
  ///   flutter build apk --dart-define=SITE_URL=https://your-app.vercel.app
  static const String siteUrl = String.fromEnvironment(
    'SITE_URL',
    defaultValue: 'https://knowledge-vault.vercel.app',
  );
}
