import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:url_launcher/url_launcher.dart';

import 'config.dart';
import 'theme.dart';

/// The whole app: a native shell that renders the live Knowledge Vault web app.
/// The web UI, features and data all come straight from the deployment, so any
/// change shipped to the web app shows up here automatically.
class WebViewScreen extends StatefulWidget {
  const WebViewScreen({super.key});

  @override
  State<WebViewScreen> createState() => _WebViewScreenState();
}

class _WebViewScreenState extends State<WebViewScreen> {
  InAppWebViewController? _controller;
  late final PullToRefreshController _pullToRefresh;

  double _progress = 0;
  bool _firstLoadDone = false;
  bool _hasError = false;

  final Uri _siteUri = Uri.parse(AppConfig.siteUrl);

  @override
  void initState() {
    super.initState();
    _pullToRefresh = PullToRefreshController(
      settings: PullToRefreshSettings(color: kvAccent, backgroundColor: kvBg),
      onRefresh: () async => _controller?.reload(),
    );
  }

  bool _isInternal(Uri url) => url.host.isEmpty || url.host == _siteUri.host;

  Future<void> _openExternal(Uri url) async {
    if (await canLaunchUrl(url)) {
      await launchUrl(url, mode: LaunchMode.externalApplication);
    }
  }

  Future<void> _retry() async {
    setState(() {
      _hasError = false;
      _progress = 0;
    });
    await _controller?.reload();
  }

  Future<void> _handleBack() async {
    final controller = _controller;
    if (controller != null && await controller.canGoBack()) {
      await controller.goBack();
    } else {
      await SystemNavigator.pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _handleBack();
      },
      child: Scaffold(
        backgroundColor: kvBg,
        body: SafeArea(
          bottom: false,
          child: Stack(
            children: [
              InAppWebView(
                initialUrlRequest: URLRequest(url: WebUri(AppConfig.siteUrl)),
                initialSettings: InAppWebViewSettings(
                  transparentBackground: true,
                  supportZoom: false,
                  useOnDownloadStart: true,
                  mediaPlaybackRequiresUserGesture: false,
                  allowsInlineMediaPlayback: true,
                  useHybridComposition: true,
                  // Keeps the session cookie between launches so users stay
                  // signed in, matching the web experience.
                  cacheEnabled: true,
                ),
                pullToRefreshController: _pullToRefresh,
                onWebViewCreated: (c) => _controller = c,
                onProgressChanged: (c, progress) {
                  setState(() => _progress = progress / 100);
                  if (progress == 100) _pullToRefresh.endRefreshing();
                },
                onLoadStop: (c, url) {
                  _pullToRefresh.endRefreshing();
                  if (mounted) {
                    setState(() {
                      _firstLoadDone = true;
                      _hasError = false;
                    });
                  }
                },
                onReceivedError: (c, request, error) {
                  _pullToRefresh.endRefreshing();
                  if ((request.isForMainFrame ?? true) && mounted) {
                    setState(() => _hasError = true);
                  }
                },
                shouldOverrideUrlLoading: (c, action) async {
                  final uri = action.request.url;
                  if (uri == null) return NavigationActionPolicy.ALLOW;
                  const externalSchemes = {'mailto', 'tel', 'sms', 'intent'};
                  if (externalSchemes.contains(uri.scheme) || !_isInternal(uri)) {
                    await _openExternal(uri);
                    return NavigationActionPolicy.CANCEL;
                  }
                  return NavigationActionPolicy.ALLOW;
                },
                onDownloadStartRequest: (c, request) async {
                  // Hand downloads (e.g. PDF exports) to the system browser /
                  // download manager.
                  await _openExternal(request.url);
                },
                onPermissionRequest: (c, request) async {
                  // Grant camera/microphone/storage prompts (e.g. avatar upload)
                  // — the web app already gates who can do what.
                  return PermissionResponse(
                    resources: request.resources,
                    action: PermissionResponseAction.GRANT,
                  );
                },
              ),
              if (_progress < 1.0 && _firstLoadDone && !_hasError)
                _TopProgressBar(progress: _progress),
              if (!_firstLoadDone && !_hasError) const _BrandSplash(),
              if (_hasError) _ErrorView(onRetry: _retry),
            ],
          ),
        ),
      ),
    );
  }
}

class _TopProgressBar extends StatelessWidget {
  const _TopProgressBar({required this.progress});
  final double progress;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.topCenter,
      child: LinearProgressIndicator(
        value: progress,
        minHeight: 2.5,
        backgroundColor: Colors.transparent,
        valueColor: const AlwaysStoppedAnimation(kvAccent2),
      ),
    );
  }
}

/// Brand mark shown while the site's first paint is loading — a white
/// four-pointed star on the accent gradient, matching the web favicon.
class _BrandMark extends StatelessWidget {
  const _BrandMark({this.size = 76});
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        gradient: kvGradient,
        borderRadius: BorderRadius.circular(size * 0.26),
        boxShadow: [
          BoxShadow(
            color: kvAccent.withOpacity(0.45),
            blurRadius: 24,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Icon(Icons.auto_awesome, color: Colors.white, size: size * 0.5),
    );
  }
}

class _BrandSplash extends StatelessWidget {
  const _BrandSplash();

  @override
  Widget build(BuildContext context) {
    return Container(
      color: kvBg,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Spacer(),
          const _BrandMark(),
          const SizedBox(height: 22),
          const Text(
            'Knowledge Vault',
            style: TextStyle(
              color: Colors.white,
              fontSize: 20,
              fontWeight: FontWeight.w600,
              letterSpacing: -0.2,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'your structure · your knowledge · your custody',
            style: TextStyle(color: Colors.white.withOpacity(0.5), fontSize: 12),
          ),
          const Spacer(),
          const Padding(
            padding: EdgeInsets.only(bottom: 48),
            child: SizedBox(
              width: 26,
              height: 26,
              child: CircularProgressIndicator(strokeWidth: 2.4, color: kvAccent2),
            ),
          ),
        ],
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.onRetry});
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: kvBg,
      padding: const EdgeInsets.all(28),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const _BrandMark(size: 60),
          const SizedBox(height: 24),
          const Text(
            "Couldn't reach Knowledge Vault",
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 8),
          Text(
            'Check your connection and try again.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.white.withOpacity(0.6), fontSize: 14),
          ),
          const SizedBox(height: 24),
          FilledButton(
            onPressed: onRetry,
            style: FilledButton.styleFrom(
              backgroundColor: kvAccent,
              padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 12),
            ),
            child: const Text('Try again'),
          ),
        ],
      ),
    );
  }
}
