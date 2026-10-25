// The site's own photos: the only images a post may use (no uploads in v1).
import type { Locale } from "./types.ts";

const IMAGES: { src: string; fr: string; en: string }[] = [
  {
    src: "/img/posts/ecrivez-comme-vous-parlez.webp",
    fr: "Une bouche applique un rouge à lèvres rouge vif",
    en: "A mouth applying bright red lipstick",
  },
  {
    src: "/img/posts/vos-consignes-dans-un-encadre.webp",
    fr: "Une esthéticienne applique un masque au pinceau",
    en: "An esthetician brushes on a mask",
  },
  {
    src: "/img/posts/en-un-clin-d-oeil.webp",
    fr: "Un rouleau de jade passé sous l’œil",
    en: "A jade roller under the eye",
  },
  {
    src: "/img/posts/une-photo-une-legende.webp",
    fr: "Une main manucurée sur une fourrure rouge",
    en: "A manicured hand on red fur",
  },
  {
    src: "/img/posts/vos-mots-vous-appartiennent.webp",
    fr: "Des ongles graphiques sur du papier coloré",
    en: "Graphic nails on coloured paper",
  },
  {
    src: "/img/posts/essayez-tout-rien-ne-casse.webp",
    fr: "Quatre rouges à lèvres alignés",
    en: "Four lipsticks in a row",
  },
  { src: "/img/service.webp", fr: "Des mains roulent une serviette au soleil", en: "Hands roll a towel in the sun" },
  { src: "/img/vitrine.webp", fr: "La devanture d’un salon de beauté", en: "A beauty salon shopfront" },
];

export function images(locale: Locale) {
  return IMAGES.map((i) => ({ src: i.src, alt: i[locale] }));
}

export const IMAGE_SRCS = new Set(IMAGES.map((i) => i.src));
