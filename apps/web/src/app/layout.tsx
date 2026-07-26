import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "next-themes";
import { DialogProvider } from "@/components/dialogs";
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

// Applies the persisted accent palette before first paint (no flash), mirroring what
// next-themes does for light/dark.
const accentInit = `try{var a=localStorage.getItem("kv.accent");if(a)document.documentElement.setAttribute("data-accent",a)}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: next-themes sets data-theme before hydration to avoid a flash
    <html lang="en" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: accentInit }} />
        <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem>
          <div className="aurora" aria-hidden>
            <div className="aurora-blob" />
            <div className="aurora-blob" />
            <div className="aurora-blob" />
          </div>
          <DialogProvider>{children}</DialogProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
