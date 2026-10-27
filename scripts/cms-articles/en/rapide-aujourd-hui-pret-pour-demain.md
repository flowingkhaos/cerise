---
title: Fast today, *ready for tomorrow*
excerpt: One read per article, nothing to run in the browser, and one CMS for several sites.
category: Behind the scenes
publishedAt: 2026-10-27T13:00:00.000Z
cover: rapide-aujourd-hui-pret-pour-demain.webp
coverAlt: Nail polish bottles in many colours, lined up on a white surface
credit: Pexels, photo 29228977
---

Three choices make this blog fast.

**One read per article.** An article from the repository takes a single read in Deno KV, from the nearest copy: about 50 ms, measured in production.

**A short memory for the CMS.** Payload's articles stay in memory for 60 seconds. If the CMS takes longer than 2.5 seconds, for instance when Cloud Run wakes up, the blog serves the last good copy and finishes the read in the background.

**Zero public JavaScript.** The browser receives HTML and CSS. It has nothing to download or run before showing the text.

And to grow: a new site needs only a domain in the CMS. Authors keep one place to write, and each site keeps its speed.
