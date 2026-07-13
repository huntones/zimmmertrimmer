# Cookie Consent (KOLKLI)

Site-wide, GDPR-first cookie-consent banner + preferences dialog. One
self-contained file, `cookie-consent.js`, loaded on every page. No build step,
no external calls — the visitor's choice is stored only in their own browser
(localStorage) plus a first-party mirror cookie.

## What it does

On a visitor's **first arrival** it shows a banner with three equally-visible
choices (he / en / ru, RTL- and dark-theme-aware):

- **Accept all** — every category on
- **Reject all** — only strictly-necessary cookies
- **Customize** — a per-category preferences dialog

The choice is remembered and the banner is **not shown again** until it expires
(`MAX_AGE_DAYS`, default **180 days**), the consent `VERSION` is bumped, or the
visitor re-opens it to change their mind. Any non-essential script is held back
until the matching category is granted.

## Categories

| key          | always on | governs                                                        |
|--------------|-----------|----------------------------------------------------------------|
| `necessary`  | yes       | sign-in, security, language + the consent record itself        |
| `functional` | no        | preference storage — language, theme, favorites, work drafts   |
| `analytics`  | no        | aggregate/anonymous usage measurement                          |
| `marketing`  | no        | ads / remarketing / campaign measurement                       |

> Today the site ships **no** analytics or marketing scripts, so nothing
> non-essential loads. The framework below is what keeps it that way as soon as
> any such script is added.

## How it's loaded

Following the same pattern as `accessibility.js` / `notify-sound.js`:

- **Header pages** — `header.js` injects `cookie-consent.js` (depth-aware,
  self-guarding against a double include). Covers ~90 pages.
- **Standalone client pages** without the shared header include it directly with
  `<script src="./cookie-consent.js" defer></script>`: `proof`, `select`,
  `upload`, `download-portal`, `share-dialog`, `privacy`, `terms`.

A page that gets both (header **and** a direct tag) is fine — the module
self-guards via `window.__kolkliConsent`.

## Gating a non-essential script (the important part)

Write the tag as `type="text/plain"` with a `data-cc="<category>"`. It stays
inert until the visitor grants that category, then it's promoted to a live
`<script>` automatically (on the granting click, and on load for returning
visitors who already consented).

External source — put the URL in **`data-src`** (not `src`):

```html
<script type="text/plain" data-cc="analytics"
        data-src="https://www.googletagmanager.com/gtag/js?id=G-XXXX"></script>
```

Inline code — put it in the body:

```html
<script type="text/plain" data-cc="analytics">
  window.dataLayer = window.dataLayer || [];
  function gtag(){ dataLayer.push(arguments); }
  gtag('js', new Date());
  gtag('config', 'G-XXXX');
</script>
```

Google Consent Mode v2 is bridged automatically: whenever the choice changes,
if a `window.gtag` exists the module pushes an equivalent
`gtag('consent','update', …)`.

## Programmatic API — `window.KolkliConsent`

```js
KolkliConsent.get()            // { necessary, functional, analytics, marketing }
KolkliConsent.allowed('analytics')  // boolean
KolkliConsent.hasResponded()   // has the visitor chosen yet?
KolkliConsent.open()           // open the preferences dialog
KolkliConsent.acceptAll()
KolkliConsent.rejectAll()
KolkliConsent.onChange(fn)     // called now (if a choice exists) and on every change
KolkliConsent.reset()          // forget the choice and re-show the banner
```

A `kolkli:consent` `CustomEvent` is also dispatched on `window` on every change
(`event.detail === KolkliConsent.get()`):

```js
window.addEventListener('kolkli:consent', e => {
  if (e.detail.analytics) startAnalytics();
});
```

## Re-opening / changing consent

- The small **cookie button** in the bottom corner (opposite the accessibility
  button) opens the preferences dialog.
- Any element with **`data-cookie-settings`**, or a link to `#cookies` /
  `/cookies`, also opens it — e.g. the "הגדרות העוגיות" link in `privacy.html`.
- Or call `KolkliConsent.open()`.

## Where the choice is stored

- `localStorage["kolkli_cookie_consent"]` — primary
- cookie `kolkli_cc` — first-party mirror, `SameSite=Lax`, ~180-day expiry

Record shape: `{ v: <version>, ts: <epoch-ms>, c: { functional, analytics, marketing } }`.

## Knobs (top of `cookie-consent.js`)

- `VERSION` — bump to re-ask everyone after a policy change
- `MAX_AGE_DAYS` — how long a choice lasts before re-asking (default 180)
- `PRIVACY_URL` — where the banner's "Privacy policy" link points
- `CATS` — the category list
- `L` — all he/en/ru copy
