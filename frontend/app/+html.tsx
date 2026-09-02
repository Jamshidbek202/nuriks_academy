// @ts-nocheck
import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en" style={{ height: "100%" }}>
      {/*
        Impeccable direction · seed 6abe2f43
        THESIS: Nurik's Academy operations feel like a disciplined branded register,
        not a marketing page, children's product, or futuristic AI dashboard.
        OWN-WORLD: warm black fields, quiet liquid-glass panels, brass-gold active
        markers, warm-white copy, the real academy mark, and precise controls.
        STORY: identity and current operational status lead; familiar role tasks
        follow; decorative content never competes with the work.
        FIRST VIEWPORT: academy identity, overview, today/status, and the original
        role bottom navigation; login uses a compact panel over quiet gold atmosphere.
        FORM: layered but restrained operational glass, tabular values, 48px touch
        targets, minimal motion, and no bento, gradient text, glow, or huge type.
        FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
      */}
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
        />
        {/*
          Disable body scrolling on web to make ScrollView components work correctly.
          If you want to enable scrolling, remove `ScrollViewStyleReset` and
          set `overflow: auto` on the body style below.
        */}
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              :root { color-scheme: dark; background: #080907; }
              * { box-sizing: border-box; }
              html {
                -webkit-text-size-adjust: 100%;
                text-size-adjust: 100%;
                touch-action: manipulation;
              }
              html, body, #root, body > div:first-child { background: #080907 !important; overscroll-behavior: none; }
              html { scrollbar-color: #41423B #080907; scrollbar-width: thin; }
              body { caret-color: #D9B84A; }
              ::-webkit-scrollbar { width: 10px; height: 10px; }
              ::-webkit-scrollbar-track { background: #080907; }
              ::-webkit-scrollbar-thumb { background: #41423B; border: 2px solid #080907; border-radius: 5px; }
              ::-webkit-scrollbar-thumb:hover { background: #5C5E56; }
              body > div:first-child { position: fixed !important; top: 0; left: 0; right: 0; bottom: 0; }
              [role="tablist"] [role="tab"] * { overflow: visible !important; }
              [role="heading"], [role="heading"] * { overflow: visible !important; }
              button, [role="button"], input, select, textarea {
                -webkit-tap-highlight-color: transparent;
                touch-action: manipulation;
              }
              input, select, textarea { font-size: 16px !important; }
              button:focus-visible, [role="button"]:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible {
                outline: 2px solid #D9B84A !important;
                outline-offset: 2px;
              }
              ::selection { background: rgba(217, 184, 74, .28); color: #F3F0E7; }
            `,
          }}
        />
      </head>
      <body
        style={{
          margin: 0,
          height: "100%",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </body>
    </html>
  );
}
