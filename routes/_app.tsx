import { define } from "../utils.ts";
import { t } from "../lib/i18n.ts";

export default define.page(function App({ Component, state }) {
  const d = t(state.locale);
  return (
    <html lang={d.htmlLang} data-theme={state.theme} class={state.xray ? "rx-on" : undefined}>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <title>{d.siteTitle}</title>
        <meta name="theme-color" content="#c8102e" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="preload" as="font" type="font/woff2" href="/fonts/roundo-700.woff2" crossorigin="anonymous" />
        <link rel="preload" as="font" type="font/woff2" href="/fonts/figtree.woff2" crossorigin="anonymous" />
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link rel="preconnect" href="https://cdn.fontshare.com" crossorigin="anonymous" />
        {/* Sentient's ITF licence keeps its files out of this public repo: Fontshare serves it. */}
        <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=sentient@401&display=swap" />
      </head>
      <body>
        <Component />
      </body>
    </html>
  );
});
