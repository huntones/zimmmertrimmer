# Clean URLs — where the rules live

Every page on kolkli.com is canonically **extensionless** (`/about`, not
`/about.html`). Two things must be true on whatever serves the site:

1. `/<anything>.html` → **301** → `/<anything>` (and `/index.html` → `/`,
   `/<dir>/index.html` → `/<dir>/`), query string preserved, host unchanged.
2. `/<anything>` is served **from** `<anything>.html` as a normal 200 (internal
   rewrite, no redirect) — otherwise step 1 lands on a 404.

There are four config surfaces, one per possible host. Only the one matching
the live stack does anything; the rest are inert but kept in sync.

| File | Applies to | Rule style |
|---|---|---|
| `deploy/clean-urls.conf` | **nginx** (the current kolkli.com stack) — `include` inside the existing `listen 443 ssl` server block | generic regex, covers every `.html` automatically |
| `deploy/nginx-kolkli.conf` | nginx, standalone port-80 server block (fresh box / no TLS block yet) | same rules, full `server { }` |
| `.htaccess` (repo root) | Apache / LiteSpeed (Hostinger shared hosting) | generic `RewriteRule`, covers every `.html` automatically |
| `_redirects` (repo root) | Cloudflare Pages / Netlify | **enumerated, one line per page** — that format has no mid-path wildcard, so a new page needs a new line |
| `serve.py` (repo root) | local dev — and usable as the backend if nginx keeps `proxy_pass` | generic, mirrors the above |

## Live status (2026-07-23)

kolkli.com is `nginx/1.24.0 (Ubuntu)` → `proxy_pass` → `python -m http.server`.
That python server knows nothing about clean URLs, so today `/about.html`
returns raw 200 and `/about` returns a python 404 page. Fix = apply
`deploy/clean-urls.conf` (see the instructions in its header), or swap the
proxied backend to `serve.py`.

Check after deploying:

```sh
curl -sI https://kolkli.com/about.html | head -2   # 301 + Location: /about
curl -sI https://kolkli.com/about      | head -1   # 200
```

## Adding a new page

`.htaccess` / nginx / `serve.py` need nothing. `_redirects` needs two lines:

```
/new-page.html  /new-page  301      (in the 301 section)
/new-page  /new-page.html  200      (in the 200 section)
```

Also give the page a `<link rel="canonical">` and, if public, a `<loc>` in
`sitemap.xml`.
