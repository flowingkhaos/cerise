# Write cerise's CMS articles (domain blog-demo) to the showcase CMS through its admin API: each cover goes to
# the media library once per language (its alt text is per language), each article is created when missing and
# updated otherwise, published, the English one linked to the French one. Sources: scripts/cms-articles/.
# Never prints the key.
# usage: python3 -I scripts/cms-articles.py <env file with SHOWCASE_CMS_API_KEY> <CMS base URL>
#   local: python3 -I scripts/cms-articles.py ~/.config/kos/showcase-cms.local.env http://localhost:4620
#   prod:  python3 -I scripts/cms-articles.py ~/.config/kos/showcase-cms.prod-admin.env https://showcase-cms-1065657380974.us-east5.run.app
import json, os, re, sys, uuid, urllib.parse, urllib.request

if len(sys.argv) != 3:
    sys.exit("usage: python3 -I scripts/cms-articles.py <env file> <CMS base URL>  (see the header of this file)")
env = open(os.path.expanduser(sys.argv[1])).read()
KEY = re.search(r"^SHOWCASE_CMS_API_KEY=['\"]?([^'\"\n]+)", env, re.M).group(1)
B = sys.argv[2].rstrip("/")
AUTH = {"Authorization": f"users API-Key {KEY}"}
SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cms-articles")
DOMAIN = "blog-demo"


def call(method, path, body=None, headers=None):
    data = json.dumps(body).encode() if body is not None and not isinstance(body, bytes) else body
    h = {**AUTH, **({"Content-Type": "application/json"} if body is not None and not isinstance(body, bytes) else {}),
         **(headers or {})}
    r = json.load(urllib.request.urlopen(urllib.request.Request(f"{B}{path}", data=data, headers=h, method=method)))
    return r.get("doc", r)


def first(path, where):
    q = urllib.parse.urlencode({**{f"where[{k}][equals]": v for k, v in where.items()}, "depth": 0, "draft": "true"})
    docs = call("GET", f"{path}?{q}")["docs"]
    return docs[0] if docs else None


def read(path):
    """A source file: `key: value` front matter between --- lines, then the markdown body."""
    text = open(path, encoding="utf-8").read()
    _, head, body = text.split("---\n", 2)
    meta = dict(line.split(": ", 1) for line in head.strip().splitlines())
    return meta, body.strip() + "\n"


def media(current, filename, cover, alt, credit):
    """The article's cover: its current hero, refreshed (Payload renames uploads, so a filename never finds it
    again), or a new upload."""
    if current:
        return call("PATCH", f"/api/media/{current}", {"alt": alt, "credit": credit})["id"]
    b = uuid.uuid4().hex
    parts = [
        f'--{b}\r\nContent-Disposition: form-data; name="_payload"\r\n\r\n'.encode()
        + json.dumps({"alt": alt, "credit": credit}).encode() + b"\r\n",
        f'--{b}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f"Content-Type: image/webp\r\n\r\n".encode() + open(os.path.join(SRC, "covers", cover), "rb").read() + b"\r\n",
        f"--{b}--\r\n".encode(),
    ]
    return call("POST", "/api/media", b"".join(parts), {"Content-Type": f"multipart/form-data; boundary={b}"})["id"]


domain = first("/api/domains", {"slug": DOMAIN})["id"]
ids = {}
for locale in ("fr", "en"):  # French first: the English twin links to it
    for name in sorted(os.listdir(os.path.join(SRC, locale))):
        meta, body = read(os.path.join(SRC, locale, name))
        slug = name.removesuffix(".md")  # the same slug in both languages, like cerise's own posts
        found = first("/api/articles", {"domain.slug": DOMAIN, "locale": locale, "slug": slug})
        hero = media(found and found["hero"], f"{slug}-{locale}.webp", meta["cover"], meta["coverAlt"], meta["credit"])
        doc = {
            "title": meta["title"], "excerpt": meta["excerpt"], "category": meta["category"],
            "publishedAt": meta["publishedAt"], "body": body, "hero": hero,
            "meta": {"title": None, "description": meta["excerpt"]},
            "translationOf": ids.get(("fr", slug)) if locale == "en" else None,
            "domain": domain, "locale": locale, "slug": slug, "_status": "published",
        }
        d = call("PATCH", f"/api/articles/{found['id']}", doc) if found else call("POST", "/api/articles", doc)
        ids[(locale, slug)] = d["id"]
        print(d["id"], locale, slug, d.get("_status"), d.get("updatedAt"), "(updated)" if found else "(created)")
