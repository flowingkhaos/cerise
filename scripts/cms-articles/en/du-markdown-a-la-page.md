---
title: From markdown *to the page*
excerpt: Both sources go through the same renderer. Only the moment changes: on save for one, on read for the other.
category: Behind the scenes
publishedAt: 2026-10-27T14:00:00.000Z
cover: du-markdown-a-la-page.webp
coverAlt: Close-up of makeup and lipstick swatches on a white background
credit: Pexels, photo 24709900
---

An article always starts as markdown: plain text, with hash signs for headings and asterisks for italics.

For the repository's articles, cerise does the work once, when the article is saved. markdown-it turns the text into HTML, a filter removes anything not allowed, and the result is stored in Deno KV, ready to serve. A visit reads HTML that is already made.

For the CMS articles, Payload keeps the markdown. cerise reads it through the CMS's API, runs it through the same markdown-it and the same filter, then keeps the page in memory for 60 seconds.

Either way, the page arrives as HTML and CSS, without a line of JavaScript.
