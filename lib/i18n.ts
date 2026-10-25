// French at /, English at /en, same route segments and slugs.
import type { Locale } from "./types.ts";
import { fr } from "../i18n/fr.ts";
import { en } from "../i18n/en.ts";

export const LOCALES: Locale[] = ["fr", "en"];

export function t(locale: Locale) {
  return locale === "en" ? en : fr;
}

export function localeOf(pathname: string): Locale {
  return pathname === "/en" || pathname.startsWith("/en/") ? "en" : "fr";
}

/** A French path ("/articles/x") in the given locale. */
export function href(locale: Locale, path: string): string {
  if (locale === "fr") return path;
  return path === "/" ? "/en" : `/en${path}`;
}

/** The same page in the other language. */
export function swapLocale(pathname: string): string {
  if (localeOf(pathname) === "en") return pathname.replace(/^\/en/, "") || "/";
  return href("en", pathname);
}

const TZ = "America/Toronto";

export function fmtDate(locale: Locale, ms: number): string {
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-CA" : "en-CA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: TZ,
  }).format(ms);
}

export function topicLabel(locale: Locale, slug: string): string {
  return t(locale).topics[slug] ?? slug;
}
