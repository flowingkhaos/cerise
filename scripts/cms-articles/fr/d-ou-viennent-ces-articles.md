---
title: D’où viennent *ces articles*
excerpt: Six articles de ce blogue vivent dans des fichiers. Les autres, comme celui-ci, viennent d’un CMS partagé. Les rayons X montrent lequel est lequel.
category: Coulisses
publishedAt: 2026-10-27T15:00:00.000Z
cover: d-ou-viennent-ces-articles.webp
coverAlt: Des échantillons de vernis à ongles en éventail, dans un salon de beauté
credit: Pexels, photo 3997359
---

Ce blogue a deux sources.

Les six premiers articles sont des fichiers markdown rangés dans le dépôt du site, dans `content/fr/`. Au premier démarrage, cerise les copie dans Deno KV, l’entrepôt de données intégré à son hébergeur. Quand l’administratrice les modifie dans l’éditeur de cerise, c’est cette copie qui change.

Les autres, dont celui-ci, sont écrits dans Payload, un CMS hébergé sur Google Cloud Run. Ce même CMS sert aussi les sites de Linteau et de Clapet. Chaque article y porte un domaine, `blog-demo`, pour que chaque site ne lise que les siens.

À l’œil, rien ne les distingue : même gabarit, même rendu. Allumez les rayons X avec le bouton « Rayons X ». Chaque article affiche alors sa source, l’endroit où il est rangé et le chemin qu’il prend jusqu’à vous.
