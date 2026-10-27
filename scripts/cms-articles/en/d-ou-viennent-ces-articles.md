---
title: Where *these articles* come from
excerpt: Six articles on this blog live in files. The others, like this one, come from a shared CMS. The X-ray shows which is which.
category: Behind the scenes
publishedAt: 2026-10-27T15:00:00.000Z
cover: d-ou-viennent-ces-articles.webp
coverAlt: Nail polish samples fanned out in a beauty salon
credit: Pexels, photo 3997359
---

This blog has two sources.

The first six articles are markdown files kept in the site's repository, in `content/en/`. On first start, cerise copies them into Deno KV, the data store built into its host. When the admin edits them in cerise's editor, that copy is what changes.

The others, this one included, are written in Payload, a CMS hosted on Google Cloud Run. The same CMS also serves the Linteau and Clapet sites. Each article there carries a domain, `blog-demo`, so each site reads only its own.

To the eye, nothing tells them apart: same template, same rendering. Turn on the X-ray with the "X-ray" button. Each article then shows its source, where it is stored and the path it takes to reach you.
