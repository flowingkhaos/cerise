# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Fresh 2 + Preact islands on Deno, Deno KV for storage, Deno Deploy for hosting; one CSS token
sheet, no React, no Tailwind. Decided in the project's architecture interview (2026-10-25).

## Users

- **Readers:** owners and professionals in esthetics, cosmetology, beauty and care — mostly small
  businesses in Quebec (estheticians, cosmetologists, nail and lash techs, spa and clinic owners).
  They arrive from a Loom, a post or a shared link, usually on a phone between clients.
- **Prospects trying the CMS:** the same people, signed in with the visitor account printed on the
  login page. They open the editor, write, press Publish, and learn it is a demo.
- **The admin:** the operator, the only account that changes content.

## Product Purpose

A blog for beauty and care pros that shows what a blog-specific app feels like: article pages
that load instantly, markdown that renders cleanly, and a small CMS with a real editor. It is a
showcase — a sales asset for blog and CMS builds — and a public open-source repo others can build
on. Success: a visitor reads a post, tries the editor, and comes away thinking "I want my site to
feel like this."

## Positioning

Built for one job — writing and delivering articles — instead of a general site builder with a
blog bolted on. Each article is rendered once, when it is saved, so reading it costs one storage
read and no client JavaScript. The editor writes plain markdown the owner can export at any time.

## Operating Context

- French first at `/`, English at `/en`, same slugs.
- Visitors read on phones; the admin writes on a laptop.
- The visitor account can do everything in the CMS except save: every submit answers a toast that
  says it is a demo.
- The operator records Looms and posts from this site.

## Capabilities and Constraints

- Public pages: home (newest posts), article, topic page, RSS, login.
- Admin: entry list, editor with a publication form (title, slug, excerpt, topics, cover,
  status), export of every post, restore of the seed posts.
- Markdown plus **named components** (`Callout`, `Figure`) from a fixed list; no other HTML, no
  scripts in content.
- No AI anywhere. No analytics or trackers. No outbound calls. Images self-hosted.
- No image uploads in v1: covers and inline images come from the site's own image set.
- No tables in the editor in v1.
- The repo is public: every self-hosted font must allow redistribution (SIL OFL preferred). A face whose licence
  forbids that (Sentient) is loaded from its foundry's servers instead.

## Brand Commitments

- Name: **cerise**, set lowercase as the wordmark (operator, 2026-10-25).
- Main colour: a deep, bright lipstick red (operator, 2026-10-25).
- Every headline shown to visitors needs the operator's explicit yes, shown alone. Approved so
  far: "Écrivez comme vous *parlez à vos clientes*." (newest post, French).
- Type (operator, 2026-10-25): Roundo for the wordmark and titles; Sentient italic for the one
  accent phrase (flowingkhaos's title face, loaded from Fontshare, never in the repo); Figtree for
  text, numbers and small lines. Bodoni Moda and Azeret Mono were rejected as jarring.
- Cards and photos are square-cornered; buttons and topic chips stay rounded (operator, 2026-10-25).
- Post photos are stock cosmetology and esthetics photos (Pexels), not generated and not drawn in
  CSS (operator, 2026-10-25). Generated photos (40.5¢, OpenRouter) serve the other spots only.

## Evidence on Hand

- No customers, testimonials, case studies or press. None may be invented.
- Seed posts are true and written for beauty pros: they explain how this blog works and how to use
  it (writing a service post, aftercare notes with a Callout, why the page is fast, exporting your
  words). Byline: the operator. No skin-care, treatment or health claims — this is not an
  expert's advice column.
- Any speed figure shown on the site is measured (with its script and date) or not shown.
- Photographs: generated for this site through the operator's image studio, under a cost cap the
  operator approves. Their provenance is recorded.

## Product Principles

1. Reading comes first: a post is readable, on a phone, before anything else on the page asks for
   attention.
2. Show, don't claim: the speed and the editor are demonstrated on the page, not described.
3. The owner keeps their words: everything written exports as plain markdown.
4. A demo that cannot be harmed: visitors try everything, nothing they do is stored.

## Accessibility & Inclusion

WCAG 2.2 AA. French and English throughout, including the editor and every toast. Readers on
small phones in bright light: body text and the red must hold contrast on every ground they sit on.
