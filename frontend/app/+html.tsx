// @ts-nocheck
import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en" style={{ height: "100%" }}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
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
              :root { color-scheme: dark; background: #090A08; }
              * { box-sizing: border-box; }
              html, body { background: #090A08; }
              html { scrollbar-color: #41453A #090A08; scrollbar-width: thin; }
              body { caret-color: #E0BE45; }
              ::-webkit-scrollbar { width: 10px; height: 10px; }
              ::-webkit-scrollbar-track { background: #090A08; }
              ::-webkit-scrollbar-thumb { background: #41453A; border: 2px solid #090A08; border-radius: 5px; }
              ::-webkit-scrollbar-thumb:hover { background: #5D6155; }
              body > div:first-child { position: fixed !important; top: 0; left: 0; right: 0; bottom: 0; }
              [role="tablist"] [role="tab"] * { overflow: visible !important; }
              [role="heading"], [role="heading"] * { overflow: visible !important; }
              button, [role="button"], input, select, textarea { -webkit-tap-highlight-color: transparent; }
              button:focus-visible, [role="button"]:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible {
                outline: 2px solid #E0BE45 !important;
                outline-offset: 2px;
              }
              ::selection { background: rgba(224, 190, 69, .28); color: #F4F1E7; }
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
