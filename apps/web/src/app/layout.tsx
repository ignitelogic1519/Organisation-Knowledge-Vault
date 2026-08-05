import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "next-themes";
import { DialogProvider } from "@/components/dialogs";
import { HintLayer } from "@/components/Hint";
import { MailProvider } from "@/components/mail-events";
import { Pointer } from "@/components/Pointer";
// Load order matters: Bootstrap base first, then the app's custom design tokens
// (which win on the few shared class names), then the branded Bootstrap theme
// layer that maps Bootstrap's components onto our brand ("custom UI over Bootstrap").
import "bootstrap/dist/css/bootstrap.min.css";
import "./globals.css";
import "./bootstrap-theme.css";

export const metadata: Metadata = {
  title: "Knowledge Vault",
  description:
    "Organizational training and compliance — your structure, your knowledge, your custody.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Appearance is restored before first paint from a COOKIE first, localStorage second —
// the cookie is what survives across sessions and devices where site storage gets cleared
// more aggressively than cookies do. The default is the warm peach-white day theme; dark
// is a deliberate choice the reader makes, not the starting point.
const appearanceInit = `
try{
  var read=function(k){
    var m=document.cookie.match('(?:^|; )'+k+'=([^;]*)');
    if(m) return decodeURIComponent(m[1]);
    try{ return localStorage.getItem(k) }catch(e){ return null }
  };
  var d=document.documentElement;
  var t=read('kv.theme')||'light';
  d.setAttribute('data-theme', t==='dark'?'dark':'light');
  try{ localStorage.setItem('theme', t==='dark'?'dark':'light') }catch(e){}
  d.setAttribute('data-accent', read('kv.accent')||'peach');
}catch(e){}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the script above sets data-theme before hydration
    <html lang="en" suppressHydrationWarning data-theme="light" data-accent="peach">
      <body>
        <script dangerouslySetInnerHTML={{ __html: appearanceInit }} />
        <ThemeProvider attribute="data-theme" defaultTheme="light" enableSystem={false}>
          <div className="aurora" aria-hidden>
            <div className="aurora-blob" />
            <div className="aurora-blob" />
            <div className="aurora-blob" />
          </div>
          <MailProvider>
            <DialogProvider>{children}</DialogProvider>
          </MailProvider>
          {/* The pointer and the hint layer sit above everything and intercept nothing.
              Both no-op on touch devices and degrade to the native cursor/tooltip if
              their scripts never run. */}
          <Pointer />
          <HintLayer />
        </ThemeProvider>
      </body>
    </html>
  );
}
