---
title: Rapide aujourd’hui, *prêt pour demain*
excerpt: Une lecture par article, rien à exécuter dans le navigateur, et un seul CMS pour plusieurs sites.
category: Coulisses
publishedAt: 2026-10-27T13:00:00.000Z
cover: rapide-aujourd-hui-pret-pour-demain.webp
coverAlt: Des flacons de vernis à ongles de toutes les couleurs, alignés sur une surface blanche
credit: Pexels, photo 29228977
---

Trois choix font la vitesse de ce blogue.

**Une lecture par article.** Un article du dépôt tient en une seule lecture dans Deno KV, sur la copie la plus proche : environ 50 ms, mesurées en production.

**Une mémoire courte pour le CMS.** Les articles de Payload restent 60 secondes en mémoire. Si le CMS tarde plus de 2,5 secondes, par exemple au réveil de Cloud Run, le blogue sert la dernière bonne copie et finit la lecture en arrière-plan.

**Zéro JavaScript public.** Le navigateur reçoit du HTML et du CSS. Il n’a rien à télécharger ni à exécuter avant d’afficher le texte.

Et pour grandir : un nouveau site n’a besoin que d’un domaine dans le CMS. Les auteurs gardent un seul endroit pour écrire, et chaque site garde sa vitesse.
