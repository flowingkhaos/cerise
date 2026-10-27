// The whole data model. KV key layout lives in lib/store.ts.

export type Locale = "fr" | "en";
export type Role = "admin" | "visitor";
export type Status = "draft" | "published";

/** One table-of-contents entry, from the rendered headings. */
export interface Heading {
  id: string;
  text: string;
  level: 2 | 3;
}

/** What lists show. Never carries a body. */
export interface PostSummary {
  id: string;
  locale: Locale;
  slug: string;
  /** Markdown-inline title: *one phrase* in asterisks is the accent. */
  title: string;
  excerpt: string;
  topics: string[];
  cover: string;
  coverAlt: string;
  number: number;
  status: Status;
  author: string;
  /** UTC epoch ms; 0 while a draft has never been published. */
  publishedAt: number;
  updatedAt: number;
  words: number;
  minutes: number;
  /** Only on an article from the shared Payload CMS (lib/cms.ts); a Deno KV post never has it. */
  cms?: CmsRef;
}

/** Where a Payload article lives in the CMS, for the X-ray and the edit link. */
export interface CmsRef {
  id: number;
  category: string;
  /** The hero's media row, when the page shows it. */
  media: { id: number; file: string; credit: string } | null;
}

/** A post's metadata row. Bodies live in chunks beside it. */
export interface Post extends PostSummary {
  createdAt: number;
  toc: Heading[];
  srcChunks: number;
  htmlChunks: number;
}

/** What the publication form sends. */
export interface PostInput {
  locale: Locale;
  slug: string;
  title: string;
  excerpt: string;
  topics: string[];
  cover: string;
  coverAlt: string;
  status: Status;
  source: string;
}

export interface Session {
  role: Role;
  exp: number;
}

export interface Toast {
  kind: "ok" | "demo" | "error";
  title: string;
  body?: string;
}

export interface State {
  locale: Locale;
  role: Role | null;
  /** A toast carried across a redirect (lib/flash.ts). */
  toast?: Toast;
  /** The visitor's light/dark pick (cookie); unset follows the system. */
  theme?: "light" | "dark";
  /** The X-ray layer (cookie, routes/rayons-x.ts): tags every piece of a public page with its source. */
  xray?: boolean;
}
