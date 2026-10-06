import type { Metadata, Viewport } from "next";
import { Geist, Inter } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { DialogProvider } from "@/components/dialogs";
import { HintLayer } from "@/components/Hint";
import { MailProvider } from "@/components/mail-events";
import { SessionGuard } from "@/components/SessionGuard";
// Load order matters: Bootstrap base first, then the app's custom design tokens
// (which win on the few shared class names), then the branded Bootstrap theme
// layer that maps Bootstrap's components onto our brand ("custom UI over Bootstrap").
import "bootstrap/dist/css/bootstrap.min.css";
import "./globals.css";
import "./bootstrap-theme.css";

// Type (globals.css, "Type"): Inter for reading text, Geist for the interface. next/font
// downloads both at build time and serves them from this site, so no visitor's browser asks
// Google for them; each one only sets a CSS variable that the stylesheet's stacks pick up.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });

/**
 * Clash Display, for headings, is a Fontshare font and is not on Google Fonts, so it comes
 * from Fontshare's own CDN — its supported way to embed it. `display=swap` paints the
 * heading in the fallback straight away rather than holding the text back, and if the CDN
 * cannot be reached the headings simply stay in Geist.
 */
const CLASH_DISPLAY = "https://api.fontshare.com/v2/css?f[]=clash-display@500,600,700&display=swap";

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
// more aggressively than cookies do. The default is the white-and-blue day theme; dark
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
  d.setAttribute('data-accent', read('kv.accent')||'blue');
  // Motion is a preference like the others, so it has to be on the element before the
  // first frame — otherwise a reader whose animation is off still sees one paint of it
  // on every page load.
  //
  // The default is OFF. A first-time visitor gets a calm, static interface and opts IN
  // to the motion from Appearance → Animation; only an explicit stored 'full' turns it
  // on, so an unset or unreadable preference always lands on the quieter side.
  d.setAttribute('data-motion', read('kv.motion')==='full'?'full':'off');
}catch(e){}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the script above sets data-theme before hydration
    <html
      lang="en"
      suppressHydrationWarning
      data-theme="light"
      data-accent="blue"
      data-motion="off"
      className={`${inter.variable} ${geist.variable}`}
    >
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link rel="preconnect" href="https://cdn.fontshare.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={CLASH_DISPLAY} />
      </head>
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
          {/* The hint layer sits above everything and intercepts nothing. It no-ops on
              touch devices and degrades to the native tooltip if its script never runs. */}
          <HintLayer />
          {/* Watches the hour of inactivity that ends a session (structure.md §8.8).
              Renders nothing until the last minute of it. */}
          <SessionGuard />
        </ThemeProvider>
      </body>
    </html>
  );
}
