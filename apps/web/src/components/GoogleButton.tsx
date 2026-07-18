"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";

// Renders Google's official sign-in button (Google Identity Services).
// Hidden entirely unless NEXT_PUBLIC_GOOGLE_CLIENT_ID is configured.

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: object) => void;
          renderButton: (el: HTMLElement, options: object) => void;
        };
      };
    };
  }
}

export function GoogleButton({ onCredential }: { onCredential: (idToken: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (!CLIENT_ID || !ref.current) return;

    const render = () => {
      if (!window.google || !ref.current) return;
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: (res: { credential: string }) => onCredential(res.credential),
      });
      ref.current.innerHTML = "";
      window.google.accounts.id.renderButton(ref.current, {
        theme: resolvedTheme === "dark" ? "filled_black" : "outline",
        size: "large",
        width: 320,
      });
    };

    if (window.google) {
      render();
    } else {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = render;
      document.head.appendChild(script);
    }
  }, [onCredential, resolvedTheme]);

  if (!CLIENT_ID) return null;
  return <div ref={ref} className="google-button" />;
}
