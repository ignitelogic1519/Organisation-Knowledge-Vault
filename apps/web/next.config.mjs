/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@vault/shared"],
  experimental: {
    /**
     * The design system is layered by IMPORT ORDER in app/layout.tsx: Bootstrap's base
     * first, then globals.css — which overrides it on the shared element selectors
     * (`body`, `a`, `button`, form controls) — then the branded Bootstrap theme.
     *
     * Next's default CSS chunking ("loose") is free to merge and REORDER those files,
     * and it does. Adding two client components to the root layout was enough to flip
     * bootstrap.min.css to LAST, at which point its
     * `body { color: #212529; background: #fff }` beat ours and everything inheriting
     * body's colour — the landing hero, quiet buttons, nav links — turned near-black on
     * the dark theme.
     *
     * The colour was only half of it: Bootstrap also owns `body { font-family }`, so the
     * whole app silently switched to Bootstrap's type stack at the same time. Light mode
     * was wrong too, just less obviously — a white page instead of the peach --bg.
     *
     * `false` is what fixes it. "strict" was tried first and does NOT: verified on a
     * clean build (rm -rf .next), it still emitted globals.css ahead of bootstrap. Only
     * disabling chunking preserves the declared order. The cost is coarser CSS
     * code-splitting, which is close to free here — every page loads the same design
     * system anyway — and it buys a cascade that means what the imports say it means.
     */
    cssChunking: false,
  },
};

export default nextConfig;
