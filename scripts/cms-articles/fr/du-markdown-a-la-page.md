---
title: Du markdown *à la page*
excerpt: Les deux sources passent par le même moteur de rendu. Seul le moment change : à l’enregistrement pour l’une, à la lecture pour l’autre.
category: Coulisses
publishedAt: 2026-10-27T14:00:00.000Z
cover: du-markdown-a-la-page.webp
coverAlt: Des traits de maquillage et de rouge à lèvres en gros plan, sur fond blanc
credit: Pexels, photo 24709900
---

Un article commence toujours en markdown : du texte simple, avec des dièses pour les titres et des astérisques pour l’italique.

Pour les articles du dépôt, cerise fait le travail une seule fois, au moment de l’enregistrement. markdown-it transforme le texte en HTML, un filtre retire tout ce qui n’est pas permis, puis le résultat est rangé dans Deno KV, prêt à servir. Une visite lit le HTML déjà fait.

Pour les articles du CMS, Payload garde le markdown. cerise le lit par l’API du CMS, le passe dans le même markdown-it et le même filtre, puis garde la page 60 secondes en mémoire.

Dans les deux cas, la page arrive en HTML et en CSS, sans une ligne de JavaScript.
