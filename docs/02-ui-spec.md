# 02 — UI / UX Specification: Legacy OLB-XFR Transfer Money Portal

**Source analysed:** `jennamansueto/bofa-portal` @ `main` (Struts 1.3.10 / JSP 2.1 / jQuery 1.7.2 / Tomcat 7).
**Purpose:** everything an engineer needs to rebuild the UI in React 18 + TypeScript + Vite against the Spring Boot 3 API, preserving the legacy *look* (BofA navy/red, FDIC bar, product nav, blue gradient hero, white panels) and *behaviour*, while fixing the accessibility and responsive defects listed in §9.
**Method:** every JSP, JSPF, CSS, JS and image under `src/main/webapp/` was read; the app was built and run on Tomcat 7.0.109 / JDK 8 and every page and state was screenshotted (`docs/images/legacy/`). Every statement cites the legacy file and line range it came from (`file:L<start>-<end>`). "Observed" marks behaviour confirmed in the running app on **Fri 2026-10-09 (ET)**; where the code's intent and observed output differ, both are given — the observed output is the source of truth.

Conventions: `index.jsp` = `src/main/webapp/index.jsp`; `transfer.jsp`, `confirm.jsp`, `error.jsp` = `src/main/webapp/WEB-INF/jsp/*.jsp`; `publicHeader.jspf`, `olbHeader.jspf`, `footer.jspf` = `src/main/webapp/WEB-INF/jsp/inc/*.jspf`; `olb.css` = `src/main/webapp/css/olb.css`; `olb.js` = `src/main/webapp/js/olb.js`; `ApplicationResources.properties` = `src/main/resources/ApplicationResources.properties`; Java under `src/main/java/com/bankofamerica/olb/`.

---

## Table of contents

1. [Page inventory and navigation map](#1-page-inventory-and-navigation-map)
2. [Screenshots of the legacy app](#2-screenshots-of-the-legacy-app)
3. [Component inventory](#3-component-inventory)
4. [Design tokens (from olb.css)](#4-design-tokens-from-olbcss)
5. [Every user-visible string](#5-every-user-visible-string)
6. [Form fields](#6-form-fields)
7. [AJAX Transfer Summary behaviour (olb.js)](#7-ajax-transfer-summary-behaviour-olbjs)
8. [Images / assets](#8-images--assets)
9. [Accessibility defects and required fixes](#9-accessibility-defects-and-required-fixes)
10. [React component tree proposal](#10-react-component-tree-proposal)
11. [Responsive behaviour expectations](#11-responsive-behaviour-expectations)
12. [Decisions / assumptions made in this spec](#12-decisions--assumptions-made-in-this-spec)

---

## 1. Page inventory and navigation map

### 1.1 Pages

| # | URL (legacy) | Rendered by | Purpose | Auth | Layout regions (top → bottom) |
|---|---|---|---|---|---|
| P1 | `/` and `/index.jsp` (welcome file, `web.xml:L61-63`) — optionally `?expired=1` | `index.jsp` | Public landing page with sign-in panel and credit-card marketing hero | No | FDIC bar → utility nav → logo row + search → product nav → blue gradient hero (login box, "Open an account" card, 4 card columns) → fixed cookie banner. **No footer** on this page (`index.jsp:L79-86` ends after `#cookie`). |
| P2 | `POST /login.do` | `LoginAction` (`action/LoginAction.java:L24-62`), mapping `struts-config.xml:L23-29` | Authenticates; on failure re-renders `index.jsp` (forward, URL stays `/login.do`), on success 302 → `/secure/transfer.do` | No | Same as P1 with `<html:errors/>` box inside the login panel |
| P3 | `GET /secure/transfer.do` | `TransferViewAction` (`action/TransferViewAction.java:L22-57`), `transfer.jsp` | Transfer Money page: account cards, recent activity, "Make a transfer" form, live Transfer Summary | Yes (`AuthFilter`, `web.xml:L34-41`) | Gold-top FDIC strip → utility nav → OLB bar (logo, product nav, Search pill, "Welcome, {first}", Log out) → gradient hero with calendar illustration → breadcrumb → two-column body (left 720px: intro, dash list, account cards, activity table; right: white panel with form + summary) → grey footer |
| P4 | `POST /secure/transferSubmit.do` | `TransferSubmitAction` (`action/TransferSubmitAction.java:L21-44`), mapping `struts-config.xml:L41-47` | Validates + persists. Failure: forwards to `transfer.jsp` (URL stays `/secure/transferSubmit.do`) with `<html:errors/>` box in the panel. Success: 302 → `/secure/transferConfirm.do` | Yes | Same as P3 |
| P5 | `GET /secure/transferConfirm.do[?conf=XFR…]` | `TransferConfirmAction` (`action/TransferConfirmAction.java:L17-29`), `confirm.jsp` | Confirmation receipt for the last transfer (or `?conf=` lookup); if none found → 302 `/secure/transfer.do` (`L23`) | Yes | OLB header (no hero) → breadcrumb → two-column body (left: confirmation card with green check, confirmation number, TRANSFER DETAILS table, note, two pill buttons; right: "Updated balances" account cards) → footer |
| P6 | `POST /secure/quote.do` | `TransferQuoteAction` (`action/TransferQuoteAction.java:L27-56`) | XHR JSON endpoint for the live summary (not a page). See §7. | Yes | — |
| P7 | `GET /logout.do` | `LogoutAction` (`action/LogoutAction.java:L12-18`) | Invalidates session; 302 → `/index.jsp` | No | — |
| P8 | any 404, any uncaught `Throwable`, Struts global exception | `error.jsp` via `web.xml:L65-72`, `struts-config.xml:L12-14` | "We're sorry" page | No | OLB header (unauthenticated variant shows "Log in"/"Enroll" pills) → heading, lead, monospace error reference → "Return to sign in" pill → footer. Observed HTTP status 404 for `/does-not-exist.do`. |

### 1.2 Navigation map

```
            ┌──────────────────────────────────────────────────────────────┐
            │  P1 /index.jsp  (public landing + login panel)               │
            │   ?expired=1 → red "session has ended" box                   │
            └──────┬──────────────────────────────▲────────────────────────┘
      POST /login.do│ fail: forward (same page,     │ 302 from /logout.do
                    │ URL /login.do, error box)     │ 302 from AuthFilter (/secure/* w/o session) → ?expired=1
                    │ ok: 302                       │ olb.js: XHR error status 0/302 → location = /index.jsp?expired=1
                    ▼                               │
            ┌──────────────────────────────────────┴───────────────────────┐
            │  P3 /secure/transfer.do  (Transfer Money)                    │
            │   • every change/keyup → POST /secure/quote.do (JSON)        │
            │   • "Transfer now" → POST /secure/transferSubmit.do          │
            │        fail: forward back (URL /secure/transferSubmit.do)    │
            │        ok:   302 → /secure/transferConfirm.do                │
            │   • logo / Home / Accounts crumbs → /secure/transfer.do      │
            │   • "Log out" → /logout.do                                   │
            └──────┬───────────────────────────────────────────────────────┘
                   ▼
            ┌──────────────────────────────────────────────────────────────┐
            │  P5 /secure/transferConfirm.do  (Confirmation)               │
            │   • "Make another transfer" → /secure/transfer.do            │
            │   • "Print" → window.print()                                 │
            │   • no transfer in session & no ?conf → 302 /secure/transfer.do │
            └──────────────────────────────────────────────────────────────┘
   Any 404 / exception → P8 error.jsp → "Return to sign in" → /index.jsp
```

All other links in headers, product nav, footer, "Forgot user ID/password", "Security & Help", "Enroll", "Open an account", card offers, "Privacy Notices" are `href="#"` dead links (`publicHeader.jspf:L4-5,L11-18`; `index.jsp:L41-42,L55,L61,L67,L73,L82`; `olbHeader.jspf:L6-7,L12-13,L16,L22`; `footer.jspf:L2`). The search form has `onsubmit="return false;"` (`publicHeader.jspf:L9`).

### 1.3 Session, auth, caching behaviour relevant to the UI

* Session timeout 10 minutes (`web.xml:L57-59`). Any `/secure/*` request without `olb.customer` in session → `Cache-Control: no-cache, no-store` + 302 to `{ctx}/index.jsp?expired=1` (`web/AuthFilter.java:L26-29`). Authenticated responses carry `Cache-Control: no-cache, no-store, must-revalidate` and `Pragma: no-cache` (`L31-32`); Struts controller also sets `nocache="true"` (`struts-config.xml:L60`).
* `index.jsp` reads cookie `olb_uid` to pre-fill User ID (`index.jsp:L5-11`). `LoginAction` writes it with max-age 365 days when "Save user ID" is checked, else max-age 0 (delete) (`action/LoginAction.java:L53-56`).
* Login: blank user or password → `error.login.required`; locked (`STAT_CD='L'`) or third consecutive failure → `error.login.locked`; otherwise `error.login.invalid` (`LoginAction.java:L29-45`; `service/AuthService.java:L23-34`; `dao/CustomerDAO.java:L43-63`). A locked account stays locked even with the correct password (observed with `sam.chen`). Lock is never released by the web app ("Unlock is a CICS OLBM02 function", `CustomerDAO.java:L52`).
* New session is created on successful login (session-fixation defence, `LoginAction.java:L47-51`).
* `TransferForm` is **session-scoped** (`struts-config.xml:L35-39,L41-47`), so From/To/tier/delivery/frequency persist across round trips. After a successful submit `amount`, `memo` and `scheduledDate` are cleared but tier and account choices are kept (`TransferSubmitAction.java:L29-32`). `reset()` is a no-op (`form/TransferForm.java:L37-39`).

---

## 2. Screenshots of the legacy app

All captured at 1600×1000 viewport (full-page) unless stated; panel close-ups are element screenshots of `td.rcol .panel`. Files live in `docs/images/legacy/`.

| State | File |
|---|---|
| Landing (desktop, cookie banner visible) | ![01](images/legacy/01-landing-desktop.png) |
| Landing after cookie banner dismissed | ![02](images/legacy/02-landing-cookie-dismissed.png) |
| Login error — blank fields | ![03](images/legacy/03-login-error-required.png) |
| Login error — wrong password | ![04](images/legacy/04-login-error-invalid.png) |
| Login error — account locked (3rd failure, `sam.chen`) | ![05](images/legacy/05-login-error-locked.png) |
| Session-expired redirect (`/secure/transfer.do` without session → `/index.jsp?expired=1`) | ![06](images/legacy/06-session-expired.png) |
| Transfer Money — default after login (From Checking, To Savings, Amount 500, tier Gold, summary priced) | ![07](images/legacy/07-transfer-default.png) |
| Panel close-up — default | ![08](images/legacy/08-transfer-panel-default.png) |
| Panel — amount `1250.50` + tier Standard → summary re-priced via AJAX | ![09](images/legacy/09-transfer-summary-amount-tier-changed.png) |
| Panel — To = external Chase, **Delivery selector appears**, EXS Standard → "No fee", Thu Oct 15 2026 | ![10](images/legacy/10-transfer-external-exs-standard.png) |
| Panel — EXN Standard → **$3.00 fee**, total $503.00, Tue Oct 13 2026 (Columbus Day skipped) | ![11](images/legacy/11-transfer-external-exn-standard-fee.png) |
| Panel — EXN Gold → "No fee" | ![12](images/legacy/12-transfer-external-exn-gold.png) |
| Panel — Schedule options expanded | ![13](images/legacy/13-transfer-schedule-options.png) |
| Inline quote error — same From/To | ![14](images/legacy/14-quote-error-same-account.png) |
| Inline quote error — per-transfer limit ($5,000.00, Gold EXS) | ![15](images/legacy/15-quote-error-per-txn-limit.png) |
| Inline quote error — insufficient available balance | ![16](images/legacy/16-quote-error-nsf.png) |
| Inline quote error — invalid amount (`12.345`) | ![17](images/legacy/17-quote-error-invalid-amount.png) |
| Inline quote error — bad date (`13/45/2026`) | ![18](images/legacy/18-quote-error-date-invalid.png) |
| Inline quote error — past date (`01/01/2020`) | ![19](images/legacy/19-quote-error-date-past.png) |
| Inline quote error — empty amount | ![20](images/legacy/20-quote-error-amount-required.png) |
| Server-side submit error (empty amount), full page — URL `/secure/transferSubmit.do` | ![21](images/legacy/21-submit-error-amount-required.png) |
| Server-side submit error, panel close-up (red `.olb-errbox` list above the form) | ![22](images/legacy/22-submit-error-panel.png) |
| Server-side submit error — same account | ![23](images/legacy/23-submit-error-same-account.png) |
| Confirmation — internal $500, Posted same day, `XFR261009-000001` | ![24](images/legacy/24-confirmation-internal-posted.png) |
| Transfer Money after posting — balances $3,715.38 / $13,440.00, new activity row | ![25](images/legacy/25-transfer-after-posted.png) |
| Confirmation — external EXN $250 Weekly with memo, Scheduled, delivery date | ![26](images/legacy/26-confirmation-external-scheduled.png) |
| Transfer Money after external — checking card shows "Available $3,465.38" hold line | ![27](images/legacy/27-transfer-after-external-hold.png) |
| Error page (404 `/does-not-exist.do`) | ![28](images/legacy/28-error-page-404.png) |
| **Narrow viewport 375px — landing** (absolute-positioned hero collapses, cards overflow) | ![30m](images/legacy/30-landing-mobile-375.png) |
| **Narrow viewport 375px — Transfer Money** (header tables wrap over the hero; product nav intercepts clicks on the login button) | ![31m](images/legacy/31-transfer-mobile-375.png) |
| Tablet 1024px — landing | ![30t](images/legacy/30-landing-tablet-1024.png) |
| Tablet 1024px — Transfer Money | ![31t](images/legacy/31-transfer-tablet-1024.png) |

Layout-break note (observed): at 375px the login `button.btn-primary` could not be clicked by Playwright because `#prodnav a` elements overlap it — the 52px-high product nav wraps to many lines and its links sit on top of the hero (`olb.css:L32-33` fixed `height:52px` with wrapping inline-blocks). There are **no media queries** anywhere in `olb.css`.

---

## 3. Component inventory

Each component: where it is rendered, DOM structure, styling hooks, states. Sizes are from `olb.css`.

### 3.1 FDIC bar (public) — `#fdicbar`
* Source `publicHeader.jspf:L2`; CSS `olb.css:L15-17`.
* Structure: `div#fdicbar` → `span.deposits` ("Bank of America deposit products:", italic #444) + `img[src=images/fdic.png alt="FDIC" 60×20]` + `<b>` ("FDIC-Insured - Backed by the full faith and credit of the U.S. Government").
* Style: background #f3f3f3, text #333 12px, centred, padding 9px 0. Image vertical-align middle, margin 0 6px 0 8px.
* States: none. Appears only on P1/P2 (public header).

### 3.2 FDIC strip (authenticated) — `#olbtop`
* Source `olbHeader.jspf:L4`; CSS `olb.css:L68`.
* Text "Bank of America, N.A. Member FDIC. Equal Housing Lender", 12px #333, centred, padding 8px 0, **4px gold top border #f4e3a3**, 1px bottom border #e3e3e3. No FDIC image. Appears on P3/P4/P5/P8.

### 3.3 Top utility nav — `#utilnav` (public) / `#olbutil` (authenticated)
* Source `publicHeader.jspf:L3-6`, `olbHeader.jspf:L5-8`; CSS `olb.css:L18-24` and `L69-71`.
* Layout: `div.inner > table[width=100%] > tr > td[align=left]` (segment links) + `td[align=right].util` (utility links).
* Left links: Personal, Wealth Management, Business, Corporations & Institutions. Right links: Security, About Us, En español, Contact Us, Help. Public variant inserts `span.sep` "|" separators (#ccc) and a 22×22 globe icon before "En español"; "Personal" has class `sel` (blue #0052c2 text + 3px bottom border #0052c2, line-height 45px). Authenticated variant: links **bold**, no separators, no `sel`, no globe.
* Style: height 48px, 1px bottom border #e3e3e3, links 16px #333 (public) / #1a1a1a bold (auth), padding 0 16px (public) / 0 14px (auth), line-height 48px. First link `padding-left:0`, last link `padding-right:0` (inline style).
* States: hover underline (`a:hover`, `olb.css:L5`). No active/current-page logic except the hard-coded `sel` on Personal.

### 3.4 Logo row + search (public) — `#logorow`, `#searchbox`
* Source `publicHeader.jspf:L7-10`; CSS `olb.css:L25-31`.
* Height 84px table. Left: `a.logo` → text "BANK OF AMERICA" (21px bold #012169, letter-spacing 4px, nowrap, no underline) + flag image 56×34 (`images/flag.png`, alt "") margin-left 4px, margin-top -4px. Links to `{ctx}/index.jsp`.
* Right: `form[action=#][onsubmit=return false] > table#searchbox > tr > td > input[name=q][placeholder=Search]` + `td > button[type=submit] > img[search.png alt="Search" 20×20]`. Box 296×40, 1px border #666; input 220×36 borderless, padding 0 14px, 16px, `outline:none`; button 40×36 white.

### 3.5 Product nav (public) — `#prodnav`
* Source `publicHeader.jspf:L11-19`; CSS `olb.css:L32-34`.
* Seven `a` links each followed by `img[chevron.png 12×8 alt=""]`: Checking, Savings & CDs, Credit Cards, Home Loans, Auto Loans, Merrill Investing, Better Money Habits®.
* Style: height 52px, box-shadow 0 3px 4px rgba(0,0,0,.12), `position:relative; z-index:2` (shadow over hero); links 20px #1a1a1a, padding-right 36px, line-height 52px, chevron margin-left 6px.

### 3.6 OLB header bar (authenticated) — `#olbbar`
* Source `olbHeader.jspf:L9-25`; CSS `olb.css:L72-81`.
* Table, height 102px, same box-shadow as `#prodnav`. Three cells:
  1. `td[width=330]` → `a.logo[href={ctx}/secure/transfer.do]` with flag 44×27 **before** the text (margin 0 8px 0 0) then "BANK OF AMERICA" (21px).
  2. `td.pnav` → two `div`s of links (row 1: Checking, Savings & CDs, Credit Cards, Home Loans, Auto Loans; row 2: Merrill Investing, Better Money Habits®) 16px #1a1a1a, padding-right 22px, line-height 52px.
  3. `td[align=right][nowrap]` → `a.pill.pill-search` (search icon 20×20 + "Search"; 1px #ccc border, #555 text) then, if a customer is in session: `span.welcome` "Welcome, {firstName}" (15px #333, margin-left 10px) + `a.pill.pill-fill[href={ctx}/logout.do]` "Log out"; otherwise `a.pill.pill-fill[href={ctx}/index.jsp]` "Log in" + `a.pill.pill-line` "Enroll" (`L17-23`).
* `.pill`: inline-block, height/line-height 50px, radius 26px, padding 0 26px, 17px, margin-left 12px, no underline. `.pill-fill` navy #012169 bg, white bold. `.pill-line` 2px navy border, navy bold text.
* Observed first name for `demo.user` is **Jordan** (seed `seed.sql:L2-3`, LAST_NM Rivera; README says "Jordan Reyes" — the seed wins).

### 3.7 Public hero with gradient — `#hero`
* Source `index.jsp:L26-77`; CSS `olb.css:L37-62`; IE fallback `index.jsp:L19`.
* `div#hero` height 586px, `background:#1b3fcf` fallback then `linear-gradient(90deg,#0b1e7a 0%,#1a3dcf 60%,#2255e6 100%)` (also `-webkit-linear-gradient(left,…)`). IE≤8 conditional comment uses `filter:progid:DXImageTransform.Microsoft.gradient(startColorstr='#0b1e7a',endColorstr='#2255e6',GradientType=1)` over `#1a3dcf`.
* `div.inner` is `position:relative; height:586px` and everything inside is **absolutely positioned**: `#loginbox` (left 0, top 28px, width 388px), `#openacct` (left 14px, top 472px, width 328px), `#cards` (left 470px, top 28px, right 0).

### 3.8 Login panel — `#loginbox`
* Source `index.jsp:L27-45`; CSS `olb.css:L39-49`.
* Structure: `div#loginbox` (white) → `div.redtab` (8px tall, 250px wide, #dc1431, bottom-right radius 12px) → `div.pad` (padding 20px 28px 24px) containing, in order:
  1. If `?expired=1`: `div.olb-errbox` with `error.session.expired` (`L30`).
  2. `<html:errors/>` → renders `errors.header`/`prefix`/`suffix`/`footer` from `ApplicationResources.properties:L5-8` as `<div class="olb-errbox"><ul><li>msg</li></ul></div>` (observed).
  3. `form#loginForm[method=post][action={ctx}/login.do]` → `label[for=userId]` "User ID", `input#userId.txt[name=userId]` (value prefilled from cookie), `label[for=password]` "Password", `input#password.txt[type=password][name=password]` (never redisplayed), `div.chk` → `input#saveUserId[type=checkbox][value=true]` + inline `label[for=saveUserId]` "Save user ID", `button.btn-primary[type=submit]` "Log in".
  4. `div.links`: "Forgot user ID/password" / `<br/>` / "Security & Help" + 5 `&nbsp;` + "Enroll" (centre, 15px, line-height 32px, #0052c2).
* Styles: labels block 16px #1a1a1a margin 10px 0 8px; `input.txt` 304×38, 1px #666 border, padding 0 10px, 16px; checkbox 20×20 margin-right 10px; `.chk` margin 16px 0, 16px.
* States: default; `expired` box; one of three error messages; prefilled user id (cookie). No client-side validation; no loading state.

### 3.9 "Open an account" card — `#openacct`
* Source `index.jsp:L46`; CSS `olb.css:L50-51`. White, 1px #ddd border, radius 6px, padding 14px 16px, 16px text, `dollar.png` 24×24 icon (alt "") margin-right 10px. Not a link (plain `div`).

### 3.10 Credit-card hero columns — `#cards`
* Source `index.jsp:L48-76`; CSS `olb.css:L52-62`.
* `h1` "Choose the card that works for you" (38px, weight 300, white, margin-bottom 24px). Then a 4-column `table`, each `td` (25%, centred, padding 0 10px, top-aligned) containing: `div.stat` (62px weight 300, line-height 70px; `sup` 28px raised 12px), `div.statlbl` (16px, margin-top -6px), `div.noannual` "No annual fee." (16px, margin 12px 0 10px), `img.card` 250×150 with alt text, `div.cardname` (18px, margin 30px 0 12px), `a.offer` (white block, #0052c2 underlined bold 17px, padding 10px 6px, radius 4px, line-height 22px).
* Column data (verbatim): see §5.1.

### 3.11 Cookie banner — `#cookie`
* Source `index.jsp:L79-84`; CSS `olb.css:L63-65`; JS `olb.js:L34`.
* `position:fixed; bottom:0; left:0; right:0`, white, 1px top border #ddd, padding 22px 70px 18px, centred 15px / 24px, z-index 50, box-shadow 0 -3px 6px rgba(0,0,0,.1). Text contains two hard `<br/>` line breaks. "Privacy Notices" link bold. `img.close[close.png 16×16 alt="Close"]` absolutely positioned right 22px top 22px, cursor pointer.
* Behaviour: click on `.close` → `$('#cookie').hide()`. **Not persisted** — reappears on every load of `index.jsp` (observed). Not rendered on authenticated pages.

### 3.12 OLB hero (Transfer Money) — `#olbhero`
* Source `transfer.jsp:L28-35`; CSS `olb.css:L83-88`.
* Same gradient as §3.7, white text, padding 70px 0. Table with two cells: left `div.kicker` "ONLINE BANKING · TRANSFERS" (14px, letter-spacing 2px, uppercase, #cfd8f5), `h1` "Transfer Money" (64px weight 300, margin 14px 0 18px), `p` (18px/30px, width 560px, #e6ebff). Right `td[width=660]` → `div.illus` (644×322 white, radius 10px, centred) → `img[calendar.png 460×300 alt=""]` margin-top 10px.
* Not present on confirmation page.

### 3.13 Breadcrumb — `#crumbs`
* Source `transfer.jsp:L37`, `confirm.jsp:L22`; CSS `olb.css:L89-91`.
* `div.inner#crumbs`: links separated by `span.sep` "/" (#777, margin 0 6px); current page in `<b>`. 15px, padding 26px 0 0. Transfer page: Home / Accounts / **Transfer Money**. Confirmation: Home / Accounts / Transfer Money / **Confirmation**. All links go to `/secure/transfer.do`.

### 3.14 Two-column body — `#xfr`
* `div.inner#xfr > table[width=100%] > tr > td.lcol + td.rcol` (`transfer.jsp:L39-40,L72`; `confirm.jsp:L23-24,L49`); CSS `olb.css:L94-96`: padding 40px 0 60px; `.lcol` width 720px, padding-right 54px, top-aligned; `.rcol` top-aligned, takes the remainder (≈ 1480−720−54 = 706px at 1600 viewport).
* `#xfr h2` 30px weight 400 margin 0 0 20px; `p.lead` 16px/26px #444 width 580px; `ul.dash li` 16px/36px padding-left 26px with CSS `:before` em-dash "—" in #0052c2 (`L97-101`).

### 3.15 Account card — `.acct`
* Source `transfer.jsp:L48-55`, `confirm.jsp:L51-58`; CSS `olb.css:L102-106`. Rendered for each **non-external** account (`if (a.isExternal()) continue;`), ordered by `SEQ_NO` and only `STAT_CD='A'` (`dao/AccountDAO.java:L22`).
* Structure: `div.acct` (1px #ddd border, radius 6px, padding 18px 22px, margin-bottom 16px) → `div.bal` floated right (22px bold, margin-top 4px) = current balance `Money.format` → `div.nm` display name (16px bold) → `div.id` ACCT_ID e.g. "ACCT-1001" (14px #666, margin-top 4px) → **only when available ≠ current**: `div.avl` "Available $x" (12px #777, right-aligned).
* Display name rule (`model/Account.java:L47-54`): `"{EXT_BANK_NM} - "` prefix only for external, then `"{PROD_NM} ...{LAST4}"` — e.g. "Advantage Plus Banking - Checking ...1001", "Advantage Savings ...1002", "JPMorgan Chase Bank, N.A. - Chase Total Checking ...4432".
* Money format (`util/Money.java:L18-26`): `NumberFormat.getCurrencyInstance(Locale.US)`, negatives as `-$1.00`.
* Observed values on fresh start: Checking $4,215.38, Savings $12,940.00; after $500 internal: $3,715.38 / $13,440.00; after $250 external hold: Checking card gains "Available $3,465.38".

### 3.16 Recent activity table — `table.activity`
* Source `transfer.jsp:L57-69`; CSS `olb.css:L129-133`. Data: `TransferDAO.findRecent(custId, 10)` ordered `CRT_TS DESC, XFR_ID DESC` (`dao/TransferDAO.java:L71-76`) — note the `max` argument is passed but the SQL shown has no row limit; observed with ≤5 rows.
* Columns (th text uppercase, 12px #555, letter-spacing 1px, 2px bottom border #ddd, padding 8px 10px): DATE, CONFIRMATION, FROM, TO, STATUS, AMOUNT (last th `text-align:right`). Cells 14px padding 12px 10px, 1px bottom border #eee.
* Cell contents: DATE = `fmt:formatDate value=scheduledDate pattern=MM/dd/yyyy` — **observed output is ISO `2026-10-06`** (the pattern is not applied in the running app; treat the legacy display as `yyyy-MM-dd` and see §12). CONFIRMATION in `'Courier New',monospace`. FROM/TO = joined display names. STATUS = `td.status-{P|S|R}` with message `stat.X`; for `S` appends " · {postDate}" (intended `MM/dd`, observed `2026-10-09`). AMOUNT = `td.amt` bold right-aligned; when `feeCents > 0` adds `<br/><span style="font-weight:normal;color:#777;font-size:12px">+ $3.00 fee</span>`.
* Status colours: `.status-P` #1b7f3b (green), `.status-S` #9a6b00 (amber), `.status-R` #b3261e (red) (`L133`).
* Table has `margin-top:38px`, width 100%. Empty state: header row only (no "no activity" message).

### 3.17 Transfer form panel — `.panel` + `form#xfrForm`
* Source `transfer.jsp:L73-121`; CSS `olb.css:L107-118,L124-128`.
* `div.panel` (1px #ddd, radius 10px, padding 28px 32px 32px) → `h2` "Make a transfer" (margin-bottom 6px) → `p.sub` "Choose the accounts and amount, then select Transfer now." (15px #555, margin-bottom 22px) → `<html:errors/>` (server-side `.olb-errbox`, only after a failed submit) → `form#xfrForm[method=post][action={ctx}/secure/transferSubmit.do]`:
  1. `div.fld` From `select#fromAcctId` — all active accounts incl. external, `option[value=ACCT_ID][data-ext=Y|N]`.
  2. `div.fld` To `select#toAcctId` — same option list.
  3. `table.two` → left `td.l` Amount `input#amount.txt[maxlength=16]`, right `td.r` Relationship tier `select#tierCode` (00/10/20/30).
  4. `div.fld#deliveryRow[style=display:none]` Delivery `select#delivery` (EXS/EXN) — shown by JS only when From or To is external.
  5. `div.schedlink > a#schedToggle[href=#]` "Schedule options" (14px, margin -6px 0 18px).
  6. `div#schedOpts[style=display:none]` (bg #f8f9fc, 1px #e3e6ef, radius 6px, padding 16px 16px 0, margin-bottom 20px) → `table.two` with "Send on (MM/DD/YYYY)" `input#scheduledDate.txt[maxlength=10]` and Frequency `select#frequency` (O/W/M) → `div.fld` "Memo (optional)" `input#memo.txt[maxlength=60]`.
  7. `button.btn-primary[type=submit]` "Transfer now" (margin-top 4px).
  8. `div#quoteErr` (hidden by default; #b3261e 13px margin-top 8px) — AJAX validation message.
* After the form: `div.note` "Your transfer is submitted as soon as you select Transfer now." in **Courier New monospace 14px #333 centred**, margin 14px 0 26px (`L118`), then the summary table (§3.18).
* Field styling: `.fld` margin-bottom 20px; labels block 14px #444 margin-bottom 8px; `select`/`input.txt` width 100%, **height 54px**, 1px #ccc border, radius 4px, padding 0 14px, 16px, white, border-box. `table.two td` 50% each with 8px gutter.
* States: default (priced summary), re-pricing (no spinner — values simply change ≥250 ms after the last keystroke), quote error (red text under the button, summary keeps the **previous** values), server error box above the form, Delivery row shown/hidden, Schedule options shown/hidden (toggle, not persisted across reloads), double-submit guard (button ignored for 4 s after first submit, no visual change — `olb.js:L43-50`).

### 3.18 Transfer summary panel — `table.summary` (live)
* Source `transfer.jsp:L123-133`; CSS `olb.css:L119-123`.
* `table.summary` (100%, 1px #ddd) → header row `th[colspan=2]` "TRANSFER SUMMARY" (bg #f4f4f4, 13px, letter-spacing 1px, padding 14px 16px, 1px bottom #ddd) → rows `td` label / `td.v#sX` value (right-aligned bold, 15px, padding 13px 16px, 1px bottom #e5e5e5): From `#sFrom`, To `#sTo`, Amount `#sAmount`, Fee `#sFee`, Transfer type `#sType`, Relationship tier `#sTier`, Delivery date `#sDelivery`, then `tr.total` (bg #fafafa) Total debit `#sTotal`.
* Initial server-side render: if `TransferViewAction` could price the draft, values from `TransferQuote`; otherwise every value is an em-dash "—" (`&mdash;`). Fee shows "No fee" when 0 (`service/TransferQuote.java:L40`). Delivery date format `EEE, MMM d, yyyy` e.g. "Fri, Oct 9, 2026" (`transfer.jsp:L13`). Then olb.js immediately re-prices on DOM ready (`olb.js:L41`).

### 3.19 Confirmation panel — `.confirm`
* Source `confirm.jsp:L25-47`; CSS `olb.css:L136-140`.
* `div.confirm` (1px #ddd, radius 10px, padding 30px 36px) → `span.check` "✓" (`&#10003;`, 44px circle #1b7f3b, white 28px) + inline `h2` "Your transfer has been submitted" → `div.confnbr` "Confirmation number: **XFRyyMMdd-nnnnnn**" (Courier New 20px, letter-spacing 1px, margin 18px 0) → `table.summary` with header "TRANSFER DETAILS" and rows: From, To, Amount, Fee ("No fee" when 0, else `$x.xx`, `L33`), Transfer type (`xfrtype.X`), Relationship tier (`tier.X`), Frequency (`freq.X`), Status (`td.v.status-X`, coloured), **"Posted"** when status P else **"Delivery date"** with `EEEE, MMMM d, yyyy` e.g. "Friday, October 9, 2026" (`L38`), Memo (only when non-null; HTML-escaped, `L39`), `tr.total` Total debit.
* Then `p` (#555 14px/22px): `xfr.confirm.sameday` or `xfr.confirm.external` + " Submitted {MM/dd/yyyy hh:mm a z} via Online Banking." (timestamp in America/New_York, `confirm.jsp:L8-9,L44`) e.g. "Submitted 10/09/2026 08:43 AM EDT via Online Banking."
* Buttons (`L46`): `a.btn-secondary` "Make another transfer" → `/secure/transfer.do`; `a.btn-secondary` "Print" → `window.print()`. `.btn-secondary`: inline-block, 2px #012169 border, navy bold 16px, radius 26px, padding 0 26px, height/line-height 46px, margin-right 12px.
* Right column: `h2[style=font-size:22px]` "Updated balances" + account cards (§3.15) (`confirm.jsp:L50-58`).

### 3.20 Error box — `.olb-errbox` (server-side) and `#quoteErr` (AJAX)
* `.olb-errbox` (`olb.css:L124-125`): bg #fdf1f1, 1px #d9342b border with **5px left border**, padding 10px 14px, margin-bottom 18px, text #8a1c14 14px; inner `ul` margin 0 padding-left 18px (Struts wraps each message in `<li>`). The `expired` variant on index.jsp has no `ul` (plain text, `index.jsp:L30`).
* `#quoteErr` (`L126`): plain red text #b3261e 13px, no box.

### 3.21 Footer — `#footer`
* Source `footer.jspf:L1-5`; CSS `olb.css:L143-144`. Bg #f3f3f3, #555 12px/20px, padding 26px 0 40px, margin-top 40px. Line 1: nine links (#0052c2, margin-right 18px, no underline). Line 2: legal sentence. Line 3: `span[style=color:#999]` "OLB-XFR 4.7.12 · node olbweb01a · {MM/dd/yyyy hh:mm:ss a z}" (server render time, e.g. "10/09/2026 08:43:15 AM EDT"). Present on P3, P4, P5, P8; **absent on P1/P2**.

### 3.22 Error page content — `error.jsp`
* `div.inner#xfr` → `h2` "We're sorry, Online Banking is temporarily unavailable." → `p.lead` "Please try again in a few minutes. If you continue to see this message, call us at 800.432.1000." → monospace `p` (#777 12px) "Error reference: ERR-{uppercase hex of currentTimeMillis}" + optional " · HTTP {status}" + optional " · {exception class name}" → `a.btn-secondary` "Return to sign in" → `{ctx}/index.jsp` (`error.jsp:L11-20`). Observed: `Error reference: ERR-1A120B1B35E · HTTP 404`.

### 3.23 Primary button — `.btn-primary`
* `olb.css:L46-47`: block, width 100%, bg #012169, white, no border, height 50px, 20px, radius 28px, pointer; hover bg #02308f. Used for "Log in" and "Transfer now". No disabled/loading visual.

---

## 4. Design tokens (from olb.css)

### 4.1 Colours

| Token (proposed name) | Hex / value | Legacy role(s) | Source |
|---|---|---|---|
| `color.brand.navy` | `#012169` | Logo text, `.btn-primary`, `.pill-fill` bg, `.pill-line`/`.btn-secondary` border+text | `olb.css:L27,L46,L79-80,L140` |
| `color.brand.navyHover` | `#02308f` | `.btn-primary:hover` | `L47` |
| `color.brand.red` | `#dc1431` | Login panel red tab | `L40` |
| `color.link` | `#0052c2` | All links, selected util tab + underline, dash bullets, breadcrumb links, card offers, footer links, login links | `L4,L21,L49,L62,L90,L101,L144` |
| `color.text.primary` | `#1a1a1a` | Body text, prodnav/pnav links, login labels, auth util links | `L3,L33,L42,L71,L75` |
| `color.text.secondary` | `#333` | FDIC bar text, public util links, `#olbtop`, `.welcome`, `.note` | `L15,L20,L68,L81,L118` |
| `color.text.tertiary` | `#444` | FDIC "deposit products" span, `p.lead`, field labels | `L16,L98,L110` |
| `color.text.muted` | `#555` | `.pill-search` text, `.panel .sub`, activity `th`, footer text, confirm note | `L77,L109,L130,L143`; `confirm.jsp:L42` |
| `color.text.subtle` | `#666` | `.acct .id` | `L104` |
| `color.text.faint` | `#777` | Breadcrumb separators, `.acct .avl`, "+ fee" note, error reference | `L91,L106`; `transfer.jsp:L66`; `error.jsp:L14` |
| `color.text.stamp` | `#999` | Footer version stamp | `footer.jspf:L4` |
| `color.hero.start` | `#0b1e7a` | Gradient 0% (both heroes, IE start) | `L37,L83`; `index.jsp:L19` |
| `color.hero.mid` | `#1a3dcf` | Gradient 60%, IE base colour | `L37,L83` |
| `color.hero.end` | `#2255e6` | Gradient 100% (IE end) | `L37,L83` |
| `color.hero.fallback` | `#1b3fcf` | Solid fallback before gradient | `L37,L83` |
| `color.hero.kicker` | `#cfd8f5` | "ONLINE BANKING · TRANSFERS" | `L84` |
| `color.hero.body` | `#e6ebff` | Hero paragraph | `L86` |
| `color.hero.text` | `#fff` | Hero headings, card columns | `L52,L83` |
| `color.surface.page` | `#fff` | Body, panels, login box, cookie banner, illustration card, offers | `L3,L39,L63,L87,L62` |
| `color.surface.band` | `#f3f3f3` | FDIC bar, footer | `L15,L143` |
| `color.surface.tableHead` | `#f4f4f4` | `.summary th` | `L120` |
| `color.surface.totalRow` | `#fafafa` | `.summary tr.total td` | `L123` |
| `color.surface.schedule` | `#f8f9fc` | `#schedOpts` bg | `L128` |
| `color.border.schedule` | `#e3e6ef` | `#schedOpts` border | `L128` |
| `color.border.default` | `#ddd` | Account cards, panel, confirm, summary, openacct, cookie top, activity th bottom (2px) | `L50,L63,L102,L107,L119,L130,L136` |
| `color.border.light` | `#e3e3e3` | Util nav bottom, `#olbtop`, `#olbutil` | `L18,L68,L69` |
| `color.border.row` | `#e5e5e5` | `.summary td` | `L121` |
| `color.border.rowLight` | `#eee` | `.activity td` | `L131` |
| `color.border.input` | `#ccc` | Form fields, `.pill-search`, util separators | `L23,L77,L111` |
| `color.border.inputStrong` | `#666` | Search box, login inputs | `L29,L43` |
| `color.accent.gold` | `#f4e3a3` | 4px top border on `#olbtop` | `L68` |
| `color.status.posted` | `#1b7f3b` | `.status-P`, confirmation check circle | `L133,L137` |
| `color.status.scheduled` | `#9a6b00` | `.status-S` | `L133` |
| `color.status.rejected` / `color.error.text` | `#b3261e` | `.status-R`, `#quoteErr` | `L126,L133` |
| `color.error.bg` | `#fdf1f1` | `.olb-errbox` bg | `L124` |
| `color.error.border` | `#d9342b` | `.olb-errbox` border | `L124` |
| `color.error.dark` | `#8a1c14` | `.olb-errbox` text | `L124` |
| `shadow.nav` | `0 3px 4px rgba(0,0,0,.12)` | `#prodnav`, `#olbbar` | `L32,L72` |
| `shadow.banner` | `0 -3px 6px rgba(0,0,0,.1)` | `#cookie` | `L63` |

### 4.2 Typography

* Family (body, inputs, selects, buttons): `Roboto, "Helvetica Neue", Arial, Helvetica, sans-serif` (`L3,L8`). Roboto is **not** shipped/loaded — the rendered font is Helvetica/Arial fallback (observed Liberation Sans on Linux). The rebuild should self-host Roboto or declare the same stack.
* Monospace: `"Courier New", Courier, monospace` — `.note`, `.confnbr`, activity CONFIRMATION cell, error reference (`L118,L139`; `transfer.jsp:L62`; `error.jsp:L14`).
* Size scale (px) and where used:

| px | Uses |
|---|---|
| 12 | FDIC bar, `#olbtop`, `.acct .avl`, activity `th`, footer, "+ fee" note, error reference |
| 13 | `.summary th`, `#quoteErr` |
| 14 | body default, inputs, field labels, `ul.dash li:before`, `.note`, `.olb-errbox`, `.schedlink`, activity `td`, `.acct .id`, kicker, confirm note |
| 15 | login links, `.welcome`, `.panel .sub`, `#crumbs`, `.summary td`, cookie banner |
| 16 | util nav links, login labels/inputs, `#openacct`, statlbl/noannual, `.acct .nm`, `p.lead`, `ul.dash li`, form fields, pnav links, `.btn-secondary` |
| 17 | `.pill`, `a.offer` |
| 18 | `.cardname`, hero paragraph |
| 20 | prodnav links, `.btn-primary`, `.confnbr` |
| 21 | `.logo` |
| 22 | `.acct .bal`, "Updated balances" h2 |
| 28 | `.stat sup`, confirm check glyph |
| 30 | `#xfr h2` |
| 38 | `#cards h1` |
| 62 | `#cards .stat` |
| 64 | `#olbhero h1` |

* Weights: 300 (`#cards h1`, `.stat`, `#olbhero h1`), 400 (`#xfr h2`), bold/700 (logo, `.acct .nm/.bal`, `.summary td.v`, `.activity td.amt`, pills, `.btn-secondary`, `a.offer`, auth util links, cookie link, `#fdicbar b`).
* Line-heights: 48px util nav; 45px selected tab; 52px prodnav/pnav; 70px `.stat`; 22px `a.offer`, confirm note; 24px cookie; 32px login links; 26px `p.lead`; 36px `ul.dash li`; 30px hero p; 20px footer; 50px `.pill`; 46px `.btn-secondary`; 44px `.check`.
* Letter-spacing: 4px logo; 2px kicker; 1px `.summary th`, `.activity th`, `.confnbr`.
* Text-transform: uppercase only on kicker (the TH labels are typed in capitals in markup).

### 4.3 Spacing and sizing

| Token | Value | Source |
|---|---|---|
| Page gutter `.inner` | `margin: 0 60px` (fluid width; no max-width) | `L12` |
| Hero height (public) | 586px | `L37-38` |
| Login box | width 388px, top 28px; `.pad` 20px 28px 24px; red tab 8×250 | `L39-41` |
| Open-account card | left 14px, top 472px, width 328px, padding 14px 16px | `L50` |
| Cards block | left 470px, top 28px, right 0 | `L52` |
| Card image | 250×150 | `L60` |
| Util nav height | 48px | `L18,L69` |
| Logo row height | 84px | `L25` |
| Product nav height | 52px | `L32` |
| OLB bar height | 102px | `L72` |
| OLB hero padding | 70px 0 | `L83` |
| Illustration card | 644×322, image 460×300 top-margin 10px | `L87-88` |
| Breadcrumb padding | 26px 0 0 | `L89` |
| Body padding | 40px 0 60px | `L94` |
| Left column | 720px + 54px right padding | `L95` |
| Lead paragraph width | 580px | `L98` |
| Hero paragraph width | 560px | `L86` |
| Account card | padding 18px 22px, gap 16px | `L102` |
| Panel padding | 28px 32px 32px | `L107` |
| Field | height 54px, padding 0 14px, gap 20px, label gap 8px | `L110-112` |
| Two-column field gutter | 8px each side | `L115-116` |
| Schedule box | padding 16px 16px 0, margin-bottom 20px | `L128` |
| Summary cells | th 14px 16px; td 13px 16px | `L120-121` |
| Activity cells | th 8px 10px; td 12px 10px; table margin-top 38px | `L129-131` |
| Confirm card padding | 30px 36px | `L136` |
| Pill padding / height | 0 26px / 50px | `L76` |
| Secondary button | 0 26px / 46px, gap 12px | `L140` |
| Primary button height | 50px | `L46` |
| Cookie banner padding | 22px 70px 18px | `L63` |
| Footer padding | 26px 0 40px, margin-top 40px | `L143` |

### 4.4 Border radii

| px | Uses | Source |
|---|---|---|
| 28 | `.btn-primary` | `L46` |
| 26 | `.pill`, `.btn-secondary` | `L76,L140` |
| 22 | `.confirm .check` (circle) | `L137` |
| 12 | `#loginbox .redtab` bottom-right only (`0 0 12px 0`) | `L40` |
| 10 | `#olbhero .illus`, `.panel`, `.confirm` | `L87,L107,L136` |
| 6 | `#openacct`, `.acct`, `#schedOpts` | `L50,L102,L128` |
| 4 | `a.offer`, form fields | `L62,L111` |
| 0 | everything else (tables, error box, search box) | — |

### 4.5 Gradients, shadows, breakpoints
* Hero gradient: `linear-gradient(90deg, #0b1e7a 0%, #1a3dcf 60%, #2255e6 100%)` with `-webkit-linear-gradient(left, …)` prefix and `#1b3fcf` solid fallback (`L37,L83`); IE≤8 `filter` fallback in `index.jsp:L19` only (not on transfer page).
* Shadows: §4.1 `shadow.nav`, `shadow.banner`. Vendor prefixes `-moz-`/`-webkit-` present (`L32,L63,L72`).
* **Breakpoints: none.** No `@media` rules; layout uses fixed pixel widths and absolute positioning (see §11).
* Vendor-prefixed `box-sizing` on fields (`L111`); `border-radius` prefixed `-webkit-` throughout.

---

## 5. Every user-visible string

Verbatim, grouped by page/component. `{…}` marks dynamic values. HTML entities are shown as rendered characters.

### 5.1 Landing page `index.jsp` (+ `publicHeader.jspf`)

| Component | String | Source |
|---|---|---|
| `<title>` | Bank of America - Banking, Credit Cards, Loans and Merrill Investing | `ApplicationResources.properties:L2` (`app.title`) |
| FDIC bar | Bank of America deposit products: | `publicHeader.jspf:L2` |
| FDIC bar img alt | FDIC | `L2` |
| FDIC bar | FDIC-Insured - Backed by the full faith and credit of the U.S. Government | `L2` |
| Util nav left | Personal · Wealth Management · Business · Corporations & Institutions | `L4` |
| Util nav right | Security · About Us · \| · En español · \| · Contact Us · \| · Help | `L5` |
| Logo | BANK OF AMERICA | `L8` |
| Search | placeholder "Search"; button img alt "Search" | `L9` |
| Product nav | Checking · Savings & CDs · Credit Cards · Home Loans · Auto Loans · Merrill Investing · Better Money Habits® | `L12-18` |
| Session expired box | For your security, your session has ended due to inactivity. Please log in again. | `ApplicationResources.properties:L13` via `index.jsp:L30` |
| Login labels | User ID · Password · Save user ID | `index.jsp:L33,L35,L37` |
| Login button | Log in | `L38` |
| Login links | Forgot user ID/password · Security & Help · Enroll | `L41-42` |
| Open account | Open an account | `L46` |
| Hero h1 | Choose the card that works for you | `L49` |
| Card 1 | 6% · cash back offer · No annual fee. · (img alt) Customized Cash Rewards card · Customized Cash Rewards · $200 / online bonus offer | `L52-55` |
| Card 2 | 1.5% · cash back · No annual fee. · (alt) Unlimited Cash Rewards card · Unlimited Cash Rewards · $250 / online bonus offer | `L58-61` |
| Card 3 | 1.5 · points for every $1 · No annual fee. · (alt) Travel Rewards card · Travel Rewards · 25,000 online / bonus points offer | `L64-67` |
| Card 4 | 0% · intro APR offer · No annual fee. · (alt) BankAmericard · BankAmericard® · Intro APR offer / for 21 billing cycles | `L70-73` |
| Cookie banner | We use cookies and other tracking technologies to collect data for advertising, fraud prevention, analytics, and / other purposes. By using this website, you agree to the use of these tracking technologies and to the use and / disclosure of data in accordance with our Privacy Notices | `L80-82` ("/" = hard `<br/>`) |
| Cookie close alt | Close | `L83` |

### 5.2 Login errors (rendered inside `.olb-errbox > ul > li`)

| Key | String | Trigger |
|---|---|---|
| `error.login.required` | Please enter your User ID and Password. | blank user id or password (`LoginAction.java:L29-33`) |
| `error.login.invalid` | The User ID or Password you entered does not match our records. Please try again. | unknown user or wrong password with < 3 strikes (`L39`) |
| `error.login.locked` | Your account is temporarily locked after too many unsuccessful sign-in attempts. Please call 800.432.1000. | status `L`, or the failure that reaches 3 (`L37`; `AuthService.java:L27-30`) |
| `error.session.expired` | For your security, your session has ended due to inactivity. Please log in again. | `?expired=1` |

Source `ApplicationResources.properties:L10-13`. Wrapper markup `L5-8`: `errors.header=<div class="olb-errbox"><ul>`, `errors.footer=</ul></div>`, `errors.prefix=<li>`, `errors.suffix=</li>`.

### 5.3 Authenticated header `olbHeader.jspf` (P3/P4/P5/P8)

| String | Source |
|---|---|
| Bank of America, N.A. Member FDIC. Equal Housing Lender | `L4` |
| Personal · Wealth Management · Business · Corporations & Institutions | `L6` |
| Security · About Us · En español · Contact Us · Help | `L7` |
| BANK OF AMERICA | `L10` |
| Checking · Savings & CDs · Credit Cards · Home Loans · Auto Loans / Merrill Investing · Better Money Habits® | `L12-13` |
| Search | `L16` |
| Welcome, {firstName} | `L18` |
| Log out | `L19` |
| Log in · Enroll (only when no customer in session, i.e. error page) | `L21-22` |

### 5.4 Transfer Money page `transfer.jsp`

| Component | String | Source |
|---|---|---|
| `<title>` | Transfer Money - Bank of America Online Banking | `ApplicationResources.properties:L3` |
| Hero kicker | Online Banking · Transfers (rendered uppercase by CSS) | `transfer.jsp:L30` |
| Hero h1 | Transfer Money | `L31` |
| Hero p | Move money between your accounts or to someone else — schedule one-time or recurring transfers. | `L32` |
| Breadcrumb | Home / Accounts / **Transfer Money** | `L37` |
| Left h2 | It's easy to transfer funds | `L41` |
| Lead | Move money between your Bank of America accounts or to an external account. You can schedule transfers, set up recurring transfers, or make Bank of America payments. | `L42` |
| Bullets | Transfers between your accounts post the same day. · Schedule transfers or set up recurring transfers. · Your savings preferences stay with your account. | `L44-46` |
| Account card | {balance} · {displayName} · {acctId} · Available {availableBalance} | `L50-53` |
| Activity headers | DATE · CONFIRMATION · FROM · TO · STATUS · AMOUNT | `L58` |
| Activity status | Posted · Scheduled · {postDate} · Rejected | `ApplicationResources.properties:L44-46` + `transfer.jsp:L65` |
| Activity fee note | + {fee} fee | `L66` |
| Panel h2 | Make a transfer | `L74` |
| Panel sub | Choose the accounts and amount, then select Transfer now. | `L75` |
| Field labels | From · To · Amount · Relationship tier · Delivery · Schedule options · Send on (MM/DD/YYYY) · Frequency · Memo (optional) | `L78,L84,L91,L92,L100,L105,L108,L109,L116` |
| Tier options | Standard · Preferred Rewards Gold · Preferred Rewards Platinum · Preferred Rewards Platinum Honors | `ApplicationResources.properties:L31-34` |
| Delivery options | 3 business days (no fee) · Next business day | `L37-38` |
| Frequency options | One time · Weekly · Monthly | `L40-42` |
| Submit | Transfer now | `transfer.jsp:L118` |
| Note | Your transfer is submitted as soon as you select Transfer now. | `L121` |
| Summary header | TRANSFER SUMMARY | `L124` |
| Summary labels | From · To · Amount · Fee · Transfer type · Relationship tier · Delivery date · Total debit | `L125-132` |
| Summary placeholders | — (em dash) when unpriced | `L125-132` |
| Fee zero | No fee | `TransferQuote.java:L40` |
| Transfer type values | Between your Bank of America accounts (INT) · 3 business days (no fee) (EXS) · Next business day (EXN) | `ApplicationResources.properties:L36-38` |

### 5.5 Transfer validation messages (server `.olb-errbox` and AJAX `#quoteErr`)

All from `ApplicationResources.properties:L15-29`; thrown in `service/TransferService.java:L138-204`.

| Key | String | Trigger (legacy rule) |
|---|---|---|
| `error.xfr.amount.required` | Please enter an amount. | amount blank (`L139`) |
| `error.xfr.amount.invalid` | Please enter a valid dollar amount (for example, 250.00). | not matching `-?\d{1,13}(\.\d{0,2})?` after stripping `$` and `,` (`Money.java:L38-51`; `TransferService.java:L141`) |
| `error.xfr.amount.min` | The transfer amount must be at least $0.01. | cents ≤ 0 (`L142`) |
| `error.xfr.acct.invalid` | Please select valid From and To accounts. | missing id, unknown/closed account, or account not owned by customer (`L145,L149-151`) |
| `error.xfr.sameacct` | The From and To accounts must be different. | from == to (`L146`) |
| `error.xfr.ext2ext` | Transfers between two external accounts are not supported. | both external (`L152`) |
| `error.xfr.tier.invalid` | Please select a relationship tier. | tier not in 00/10/20/30, or no fee row (`L154,L172`) |
| `error.xfr.frequency.invalid` | Please select a frequency. | frequency not O/W/M (`L155-157`) |
| `error.xfr.date.invalid` | Please enter the transfer date as MM/DD/YYYY. | non-blank date failing strict `MM/dd/yyyy` parse (`L222-235`) |
| `error.xfr.date.past` | The transfer date cannot be in the past. | sched < today ET (`L162`) |
| `error.xfr.pertxn` | This transfer exceeds the per-transfer limit of {0} for your relationship tier. | amount > per-txn limit; INT cap $99,999.99, external from `OLB_FEE_SCHED` (`L175-178`). Observed `{0}` = "$5,000.00" (Gold EXS), "$3,500.00" (Standard) |
| `error.xfr.daily` | This transfer would exceed your daily external transfer limit of {0}. Today's external transfers total {1}. | same-day external sum exceeds daily limit (`L180-186`) |
| `error.xfr.nsf` | The amount plus any fee exceeds the available balance in your From account. | internal From, amount+fee > available (`L188-190`) |
| `error.xfr.regd` | You have reached the limit of 6 transfers from your savings account this statement cycle (Regulation D). | ≥6 outbound from SAV in the month (`L192-195`) |
| `error.xfr.tier.notowned` | The selected relationship tier is not on file for this customer. | **defined but never thrown** — any tier may be selected regardless of the customer's tier (observed Standard selectable for Gold customer) |

Note: the AJAX JSON escapes `/` as `\/` (`StringEscapeUtils.escapeJavaScript`), so the raw body reads `MM\/DD\/YYYY`; jQuery's JSON parse restores `MM/DD/YYYY` on screen.

### 5.6 Confirmation page `confirm.jsp`

| Component | String | Source |
|---|---|---|
| `<title>` | Transfer Confirmation - Bank of America Online Banking | `confirm.jsp:L15` |
| Breadcrumb | Home / Accounts / Transfer Money / **Confirmation** | `L22` |
| Heading | ✓ Your transfer has been submitted | `L26`; `ApplicationResources.properties:L48` |
| Confirmation number | Confirmation number: {XFRyyMMdd-nnnnnn} | `L27` |
| Table header | TRANSFER DETAILS | `L29` |
| Labels | From · To · Amount · Fee · Transfer type · Relationship tier · Frequency · Status · Posted *or* Delivery date · Memo · Total debit | `L30-40` |
| Fee zero | No fee | `L33` |
| Note (internal) | Transfers between your Bank of America accounts post the same day. | `ApplicationResources.properties:L49` |
| Note (external) | External transfers are sent via ACH and will arrive on the delivery date shown. | `L50` |
| Note tail | Submitted {MM/dd/yyyy hh:mm a z} via Online Banking. | `confirm.jsp:L44` |
| Buttons | Make another transfer · Print | `L46` |
| Right h2 | Updated balances | `L50` |

### 5.7 Footer `footer.jspf`

| String | Source |
|---|---|
| Locations · Contact Us · Help & Support · Browser Requirements · Accessible Banking · Privacy · Security · Online Banking Service Agreement · Site Map | `L2` |
| Bank of America, N.A. Member FDIC. Equal Housing Lender © 2026 Bank of America Corporation. All rights reserved. | `L3` |
| OLB-XFR 4.7.12 · node olbweb01a · {MM/dd/yyyy hh:mm:ss a z} | `L4` |

### 5.8 Error page `error.jsp`

| String | Source |
|---|---|
| `<title>` We're sorry - Bank of America Online Banking | `L6` |
| We're sorry, Online Banking is temporarily unavailable. | `L12` |
| Please try again in a few minutes. If you continue to see this message, call us at 800.432.1000. | `L13` |
| Error reference: ERR-{hex} · HTTP {code} · {exceptionClass} | `L14-18` |
| Return to sign in | `L19` |

---

## 6. Form fields

### 6.1 Login form `form#loginForm` → `POST /login.do` (`index.jsp:L32-39`; bean `form/LoginForm.java`)

| Field | `name` / `id` | Type | Default | Client behaviour | Server outcome |
|---|---|---|---|---|---|
| User ID | `userId` | text, class `txt`, no maxlength | value of cookie `olb_uid` if present, else "" | none | blank → `error.login.required`; trimmed before lookup (`LoginAction.java:L35`) |
| Password | `password` | password, `redisplay="false"` | "" | none | blank → `error.login.required`; wrong → `error.login.invalid` / `error.login.locked` |
| Save user ID | `saveUserId` | checkbox, value `true` | unchecked (not persisted from cookie) | none | sets/clears cookie `olb_uid` (365 d) |
| submit | — | `button.btn-primary` "Log in" | | olb.js double-submit guard (4 s) | success → 302 `/secure/transfer.do` |

### 6.2 Transfer form `form#xfrForm` → `POST /secure/transferSubmit.do` (`transfer.jsp:L77-120`; bean `form/TransferForm.java`, session scope)

| Field | `name`/`id` | Type | Options (value → label) | Default | Client behaviour | Server errors it can trigger |
|---|---|---|---|---|---|---|
| From | `fromAcctId` | `select` | one `option` per active account ordered by `SEQ_NO`, `value=ACCT_ID`, `data-ext=Y|N`, label = display name. Demo: `ACCT-1001` → Advantage Plus Banking - Checking ...1001 (N); `ACCT-1002` → Advantage Savings ...1002 (N); `ACCT-1003` → JPMorgan Chase Bank, N.A. - Chase Total Checking ...4432 (Y) | first non-external account (`TransferViewAction.java:L30-38`) | change → debounce → quote; toggles Delivery row | `acct.invalid`, `sameacct`, `ext2ext`, `nsf`, `regd` (if SAV) |
| To | `toAcctId` | `select` | same list | second non-external account | same | `acct.invalid`, `sameacct`, `ext2ext` |
| Amount | `amount` | text, `maxlength=16`, class `txt` | — | `"500"` on first visit (`L40`); cleared after success; otherwise last value | keyup/change → quote. Accepts `$` and `,` (stripped), up to 2 decimals, optional leading `-` which then fails `amount.min` | `amount.required`, `amount.invalid`, `amount.min`, `pertxn`, `daily`, `nsf` |
| Relationship tier | `tierCode` | `select` | `00` → Standard; `10` → Preferred Rewards Gold; `20` → Preferred Rewards Platinum; `30` → Preferred Rewards Platinum Honors | customer's `REL_TIER_CD` (`L42`); demo.user = `10` | change → quote | `tier.invalid` (never `tier.notowned`) |
| Delivery | `delivery` | `select` in `div#deliveryRow` (hidden unless From or To `data-ext=Y`) | `EXS` → 3 business days (no fee); `EXN` → Next business day | `EXS` (`TransferForm.java:L15`) | shown/hidden by `OLB.refreshSummary`; value is still posted when hidden and ignored for INT | — (drives fee/type) |
| Schedule options | `a#schedToggle` | link | — | collapsed | click → `$('#schedOpts').toggle()`; `preventDefault` | — |
| Send on | `scheduledDate` | text, `maxlength=10`, class `txt` | — | "" (= today) ; cleared after success | keyup → quote | `date.invalid`, `date.past`; affects `daily` check and delivery date |
| Frequency | `frequency` | `select` | `O` → One time; `W` → Weekly; `M` → Monthly | `O` (`TransferForm.java:L16`) | change → quote | `frequency.invalid` |
| Memo | `memo` | text, `maxlength=60`, class `txt` | "" ; cleared after success | keyup → quote (sent but unused by quote) | none; trimmed, blank → null; HTML-escaped on confirm |
| submit | — | `button.btn-primary` "Transfer now" | | double-submit guard | success → 302 `/secure/transferConfirm.do` |

Server-side, all errors are **global** messages (`ActionMessages.GLOBAL_MESSAGE`, `TransferSubmitAction.java:L36-38`) and validation stops at the **first** failing rule in the order listed in §5.5 — only one message is ever shown at a time.

Observed defaults for `demo.user`: From Checking, To Savings, Amount 500, tier Preferred Rewards Gold, summary priced as INT / No fee / Fri, Oct 9, 2026 / $500.00.

---

## 7. AJAX Transfer Summary behaviour (olb.js)

Source `olb.js:L1-51` and `action/TransferQuoteAction.java:L27-57`.

1. **Bootstrap** (`L32-42`): on DOM ready, `OLB.ctx = $('body').attr('data-ctx')` (context path, `transfer.jsp:L25`). If `#xfrForm` exists, bind `change keyup` on **every** `#xfrForm select, #xfrForm input` (includes memo and scheduledDate) and call `OLB.refreshSummary()` once immediately.
2. **Debounce** (`L37-40`): each event clears `OLB._t` and schedules `refreshSummary` after **250 ms**. There is no in-flight guard: fast typing can produce overlapping requests and responses may arrive out of order (last response wins, not last request). No busy indicator is rendered.
3. **Delivery row toggle** (`L8-9`): before the request, `isExt = (#toAcctId selected data-ext === 'Y') || (#fromAcctId selected data-ext === 'Y')`; `#deliveryRow` is `.show()`n or `.hide()`n accordingly. This runs on every refresh, including the initial one.
4. **Request** (`L10-15`): `POST {ctx}/secure/quote.do`, body = `$('#xfrForm').serialize()` (all fields incl. hidden Delivery/Schedule), `dataType:'json'`, `cache:false` (jQuery appends `_={ts}`). No CSRF token.
5. **Response contract** (`TransferQuoteAction.java:L39-52`), `Content-Type: application/json; charset=UTF-8`:
   * success: `{"ok":true,"from":"…","to":"…","amount":"$500.00","fee":"No fee"|"$3.00","total":"$503.00","type":"<xfrtype label>","tier":"<tier label>","delivery":"Tue, Oct 13, 2026"}` — all values are **pre-formatted display strings**, JS-escaped.
   * validation failure: `{"ok":false,"message":"<localised message>"}` with HTTP 200.
   * Observed examples:
     * INT Gold 500 → `fee "No fee"`, `type "Between your Bank of America accounts"`, `delivery "Fri, Oct 9, 2026"`.
     * EXS Standard 500 to Chase → `"No fee"`, `"3 business days (no fee)"`, `"Thu, Oct 15, 2026"`.
     * EXN Standard 500 → `"$3.00"`, `"$503.00"`, `"Next business day"`, `"Tue, Oct 13, 2026"` (Mon 2026-10-12 is Columbus Day in `OLB_BANK_HOL`, `seed.sql:L38`).
     * EXN Gold → `"No fee"`, same date.
6. **Render** (`L16-24`): on `ok`, `.text()` into `#sFrom #sTo #sAmount #sFee #sType #sDelivery #sTotal #sTier`, then `#quoteErr` hidden and emptied. On `ok:false`, `#quoteErr` gets the message and is shown; **the summary keeps its previous values** (not reset to —).
7. **Transport error** (`L26-28`): if `xhr.status` is `302` or `0` (AuthFilter redirect to `index.jsp?expired=1` surfaces to XHR as a cross-page redirect / status 0), `window.location = ctx + '/index.jsp?expired=1'`. Any other HTTP error (e.g. 500 from the error page) is silently ignored — summary and error text stay as they were.
8. **Schedule toggle** (`L35`): `#schedToggle` click toggles `#schedOpts` visibility; not persisted and not re-opened on server re-render even when `scheduledDate`/`memo` have values (observed after a failed submit the box is collapsed although the values are retained in the session form).
9. **Cookie banner** (`L34`): `.close` click hides `#cookie` (no cookie set).
10. **Double-submit guard** (`L43-50`): on any `form` submit, the submit button gets `data('busy', true)` for 4 s; a second submit within that window returns `false`. No disabled styling.

Rebuild expectation: the React form should debounce 250 ms, cancel in-flight quotes (TanStack Query `keepPreviousData`/abort), show the quote error inline next to the field it concerns *and* in a live region, keep the previous summary visible while re-pricing (matching legacy), and show Delivery only when either account is external. Session expiry should be detected via a 401 problem+json rather than status 0/302 sniffing.

---

## 8. Images / assets

All under `src/main/webapp/images/` (PNG, RGBA). Used-by from the JSPs.

| File | Size | Used by | alt in legacy |
|---|---|---|---|
| `fdic.png` | 60×20 | `#fdicbar` | "FDIC" |
| `globe.png` | 22×22 | public util nav before "En español" | "" |
| `flag.png` | 56×34 (rendered 56×34 public, 44×27 auth) | logo (both headers) | "" |
| `flag-white.png` | 80×48 | **unused** by any JSP | — |
| `search.png` | 20×20 | search button, `.pill-search` | "Search" (public) / "" (auth) |
| `chevron.png` | 12×8 | product nav (public) | "" |
| `dollar.png` | 24×24 | `#openacct` | "" |
| `card-red.png` | 250×150 | Customized Cash Rewards | "Customized Cash Rewards card" |
| `card-silver.png` | 250×150 | Unlimited Cash Rewards | "Unlimited Cash Rewards card" |
| `card-blue.png` | 250×150 | Travel Rewards | "Travel Rewards card" |
| `card-white.png` | 250×150 | BankAmericard | "BankAmericard" |
| `close.png` | 16×16 | cookie banner close | "Close" |
| `calendar.png` | 460×300 | Transfer hero illustration | "" |

The rebuild may reuse these PNGs as-is (copy to `web/public/images/legacy/` or convert to SVG); the flag logo should become an inline SVG so it scales.

---

## 9. Accessibility defects and required fixes

Each row: defect observed in legacy markup → WCAG 2.2 criterion → fix the React rebuild must apply.

| # | Legacy defect (source) | WCAG | Required fix in rebuild |
|---|---|---|---|
| A1 | **Tables for layout** everywhere: util nav, logo row, product nav cells, OLB bar, hero, two-column body, `table.two` field pairs, card columns (`publicHeader.jspf:L3-10`; `olbHeader.jspf:L5-25`; `transfer.jsp:L28,L39,L90,L107`; `index.jsp:L50`) | 1.3.1 | CSS grid/flex only. Data tables (`activity`, `summary`) keep `<table>` with `<thead>/<tbody>`, `<th scope="col|row">` and a `<caption>` (visually hidden if needed). |
| A2 | No landmarks: no `<header>`, `<nav>`, `<main>`, `<footer>`, no skip link; `<h1>` on landing is inside the marketing hero, not the page purpose (`index.jsp:L49`) | 1.3.1, 2.4.1 | `header/nav[aria-label]/main/footer` landmarks, "Skip to main content" link first in DOM, one `h1` per page describing the page ("Sign in to Online Banking" visually hidden on landing is acceptable). |
| A3 | Error messages not associated with fields: Struts `<html:errors/>` renders a global list; `#quoteErr` is a plain div; no `aria-describedby`, `aria-invalid`, `role=alert`/live region, focus not moved (`transfer.jsp:L76,L119`; `index.jsp:L31`; `olb.js:L23`) | 3.3.1, 3.3.3, 4.1.3 | Field-level errors with `aria-describedby` + `aria-invalid="true"`; summary box `role="alert"` receiving focus on submit failure; live quote errors in `aria-live="polite"` region; keep the legacy wording. |
| A4 | Live summary updates silently (text swapped via jQuery) (`olb.js:L18-20`) | 4.1.3 | Wrap summary in `aria-live="polite" aria-atomic="true"` (or announce a concise "Fee $3.00, total $503.00, arrives Tue Oct 13"). |
| A5 | Decorative/informative images: flag, globe, chevron, dollar, calendar have `alt=""` (fine) but the logo link's only text is "BANK OF AMERICA" letters with no accessible name for the flag — acceptable; however the FDIC badge image carries meaning with `alt="FDIC"` only and the search icon button in the auth header has `alt=""` leaving the `.pill-search` link named only by "Search" text (ok). Cookie close is an `<img>` with click handler, not a button (`index.jsp:L83`) | 1.1.1, 4.1.2 | Close becomes `<button aria-label="Close cookie notice">`; FDIC badge `alt="FDIC"` kept with surrounding text; logo link `aria-label="Bank of America home"`. |
| A6 | Non-semantic controls: "Open an account" is a `div` styled like a card (`index.jsp:L46`); "Schedule options" is `<a href="#">` acting as a disclosure (`transfer.jsp:L105`); "Print" is `<a href="#" onclick>` (`confirm.jsp:L46`) | 4.1.2, 2.1.1 | Use `<button type="button" aria-expanded aria-controls="schedOpts">` for the disclosure, `<button>` for Print, a real link/button for Open an account. |
| A7 | Dead `href="#"` links throughout nav/footer — keyboard users tab through ~40 non-functional links, and activating them scrolls to top (`publicHeader.jspf`, `footer.jspf`, `olbHeader.jspf`) | 2.4.4 | Either real routes or render as non-interactive text / `aria-disabled` items with a reduced set; do not ship `href="#"`. |
| A8 | Colour contrast failures: `#cfd8f5` kicker on gradient ≈ 3.9:1 at 14px (fails 4.5:1); `.acct .avl` `#777` on white at 12px = 4.48:1 (fails); `.status-S` `#9a6b00` 14px on white = 4.6:1 (borderline); footer stamp `#999` on `#f3f3f3` = 2.5:1 (fails); `a.offer` ok; `#quoteErr` `#b3261e` 13px = 5.9:1 (ok) (`olb.css:L84,L106,L133,L126`; `footer.jspf:L4`) | 1.4.3 | Kicker → `#e6ebff` or white; muted text ≥ `#595959` on white (7:1 for 12px) — use `#555` minimum; scheduled amber → `#7a5400`; stamp → `#595959`. |
| A9 | Focus visibility: `#searchbox input { outline:none }` (`olb.css:L30`); no custom focus styles for pills/buttons; links rely on browser default | 2.4.7, 2.4.11 | Never remove outline; add a 2px navy/white double focus ring token (`focus.ring`). |
| A10 | Focus order / DOM order: landing hero uses absolute positioning so visual order (login → open account → cards) is DOM order — fine; but the cookie banner is **last in DOM** yet visually the first thing a user sees, and it is not announced (`index.jsp:L79`) | 2.4.3, 1.3.2 | Render the cookie notice as `role="region" aria-label="Cookie notice"` early in DOM or as a dialog; persist dismissal. |
| A11 | Form labels: labels exist (`for`/`id` pairs ok) but "Save user ID" label has inline style; `table.two` splits label/field pairs across cells; Amount has no `inputmode`, no currency affordance; date field is free text with format only in the label (`transfer.jsp:L91,L108`) | 1.3.5, 3.3.2 | `inputmode="decimal"`, `autocomplete="username"/"current-password"` on login, date input with visible format hint `id`-linked via `aria-describedby`, native `<input type="date">` or masked text with the same MM/DD/YYYY validation. |
| A12 | Password field manually `redisplay=false`; no "show password"; no `autocomplete` | 3.3.8 | Add `autocomplete="current-password"` and a show/hide toggle. |
| A13 | Session expiry: silent redirect, message only after reload; XHR failure redirects without warning (`AuthFilter.java:L26-29`; `olb.js:L27`) | 2.2.1 | Inactivity warning dialog ≥ 20 s before 10-minute timeout with "Stay signed in"; keep the "For your security…" message on return. |
| A14 | Language/encoding: `lang` attribute missing on `<html>`; ISO-8859-1 charset (`index.jsp:L1,L13`) | 3.1.1 | `<html lang="en">`, UTF-8. |
| A15 | Status conveyed by colour only (`.status-P/S/R`, green check circle) (`olb.css:L133,L137`) | 1.4.1 | Keep colour, add text (already present) plus an icon with `aria-hidden` and ensure text is the accessible name; the check circle gets `aria-hidden="true"` with heading text carrying meaning. |
| A16 | Monospace centred note under the button and Courier confirmation number are hard to read / reflow poorly (`olb.css:L118,L139`) | 1.4.12 | Use the body font with `font-variant-numeric: tabular-nums` for the confirmation number; keep copy. |
| A17 | Zoom/reflow: fixed widths (720px column, 580px lead, 388px login) and absolute positioning break at 320–1024px (observed screenshots 30/31) | 1.4.10 | Responsive layout per §11. |
| A18 | `<meta http-equiv="X-UA-Compatible" content="IE=EmulateIE8">`, XHTML 1.0 Transitional doctype (`index.jsp:L12,L16`) | — | HTML5 doctype, remove IE meta. |
| A19 | Double-submit guard gives no feedback (`olb.js:L43-50`) | 4.1.3 | Disable button + `aria-busy` + "Submitting…" label while the request is in flight. |
| A20 | Activity table: header cells are `<th>` without `scope`, no caption, status cell concatenates "Scheduled · 2026-10-09" without separation for AT (`transfer.jsp:L58,L65`) | 1.3.1 | `scope="col"`, `<caption>Recent transfers</caption>`, separate status and date into text with visually-hidden "expected" wording. |

---

## 10. React component tree proposal

Preserve the BofA identity (navy `#012169`, red `#dc1431`, link blue `#0052c2`, FDIC strip, product nav, 90° blue gradient hero, white rounded panels, pill buttons) while replacing layout tables with CSS grid. Polished, not gimmicky: no badges, no animated counters; motion limited to the summary fade (respect `prefers-reduced-motion`).

```
<App>                                    React Router 6 routes; TanStack Query provider; auth context
├─ <SkipLink/>                           "Skip to main content"
├─ route "/"              → <LandingPage>                         (legacy P1/P2  index.jsp)
│   ├─ <FdicBar variant="public"/>                                (§3.1)
│   ├─ <UtilityNav variant="public"/>                             (§3.3)
│   ├─ <PublicMasthead>  <BrandLogo/> <SiteSearch/>               (§3.4)
│   ├─ <ProductNav/>                                              (§3.5)
│   ├─ <main id="main">
│   │   └─ <HeroGradient>                                         (§3.7)
│   │        ├─ <SignInPanel>                                     (§3.8)  RHF+Zod; fields userId/password/saveUserId
│   │        │    ├─ <AlertBox tone="error" role="alert"/>        session-expired / login errors (§5.2)
│   │        │    ├─ <TextField/> <PasswordField/> <Checkbox/>
│   │        │    ├─ <ButtonPrimary>Log in</ButtonPrimary>
│   │        │    └─ <SignInLinks/>
│   │        ├─ <OpenAccountCard/>                                (§3.9)
│   │        └─ <CardOffersGrid> ×4 <CardOffer/>                  (§3.10)
│   └─ <CookieNotice/>                                            (§3.11) persisted in localStorage
├─ <RequireAuth>  (redirects to "/?expired=1" on 401, mirrors AuthFilter)
│   ├─ <OlbLayout>                                                shared shell for P3/P4/P5
│   │   ├─ <FdicBar variant="olb"/>                               (§3.2 gold top border)
│   │   ├─ <UtilityNav variant="olb"/>
│   │   ├─ <OlbHeaderBar>  <BrandLogo to="/transfers"/> <ProductNav compact/> <SearchPill/> <WelcomeMenu name/> <ButtonPill>Log out</ButtonPill>
│   │   ├─ <SessionTimeoutDialog/>                                (A13)
│   │   ├─ <main id="main"> <Outlet/>
│   │   └─ <SiteFooter stamp="OLB-XFR 4.7.12 · node …"/>         (§3.21; stamp text from API /meta or build info)
│   ├─ route "/transfers"  → <TransferMoneyPage>                  (legacy P3/P4)
│   │   ├─ <HeroGradient compact>  <Kicker/> <h1/> <p/> <Illustration src=calendar/>   (§3.12)
│   │   ├─ <Breadcrumb items=[Home, Accounts, Transfer Money]/>   (§3.13)
│   │   └─ <TwoColumn>                                            (§3.14) grid 720px/1fr → 1 col
│   │       ├─ <section aria-labelledby="intro">
│   │       │    ├─ <IntroCopy/> <DashList/>
│   │       │    ├─ <AccountCardList> ×n <AccountCard balance name id available?/>   (§3.15)
│   │       │    └─ <RecentActivityTable rows caption="Recent transfers"/>          (§3.16) <StatusText code/>
│   │       └─ <TransferPanel>                                    (§3.17) RHF+Zod, server errors mapped to fields
│   │            ├─ <AlertBox role="alert"/>                      submit errors (§5.5)
│   │            ├─ <AccountSelect name="fromAcctId"/> <AccountSelect name="toAcctId"/>
│   │            ├─ <FieldRow> <AmountField/> <TierSelect/> </FieldRow>
│   │            ├─ {isExternal && <DeliverySelect/>}            (§7 step 3)
│   │            ├─ <Disclosure label="Schedule options">  <FieldRow><DateField/><FrequencySelect/></FieldRow> <MemoField/>  </Disclosure>
│   │            ├─ <ButtonPrimary busy>Transfer now</ButtonPrimary>
│   │            ├─ <InlineError aria-live="polite"/>             quote error (§7 step 6)
│   │            ├─ <FinePrint>Your transfer is submitted…</FinePrint>
│   │            └─ <TransferSummary quote isFetching aria-live="polite"/>   (§3.18) rows From/To/Amount/Fee/Type/Tier/Delivery date/Total debit
│   └─ route "/transfers/confirmation/:conf" → <ConfirmationPage> (legacy P5)
│       ├─ <Breadcrumb …Confirmation/>
│       └─ <TwoColumn>
│           ├─ <ConfirmationCard>  <SuccessHeading check/> <ConfirmationNumber/> <TransferSummary variant="details" transfer/> <SubmittedNote/> <ButtonSecondary>Make another transfer</ButtonSecondary> <ButtonSecondary onClick=print>Print</ButtonSecondary>
│           └─ <aside aria-labelledby="updated"> <h2>Updated balances</h2> <AccountCardList/> </aside>
└─ route "*" and <ErrorBoundary> → <ErrorPage>                    (legacy P8) heading, lead, reference, Return to sign in
```

Shared primitives (`web/src/components/ui`): `ButtonPrimary` (50px, radius 28), `ButtonPill`/`ButtonSecondary` (46–50px, radius 26, filled/outline), `TextField`, `SelectField` (54px, radius 4, 1px `#ccc`), `AlertBox` (`#fdf1f1`/`#d9342b` left bar), `Panel` (1px `#ddd`, radius 10), `Card` (radius 6), `DataTable`, `HeroGradient`, `VisuallyHidden`. Tokens exported as CSS custom properties from §4 (`--color-brand-navy`, …) in `web/src/styles/tokens.css`.

Data flow: `useAccounts()`, `useRecentTransfers()`, `useQuote(formValues)` (debounced 250 ms, `placeholderData: keepPreviousData`), `useSubmitTransfer()` → navigate to confirmation with the returned confirmation number; `useTransfer(conf)` for the receipt. Defaults mirror `TransferViewAction`: From = first non-external, To = second, Amount "500" on first visit, tier = customer's tier; after success clear amount/memo/date but keep accounts and tier (store the draft in `sessionStorage`).

---

## 11. Responsive behaviour expectations

Legacy has no breakpoints (§4.5) and breaks below ~1280px (screenshots 30/31: header tables wrap over the hero, product nav links overlap the Log in button, `.lcol` 720px forces horizontal scroll, summary values wrap word-by-word). The rebuild:

| Range | Layout |
|---|---|
| ≥ 1280px (desktop) | As legacy: 60px gutters (cap content at `max-width: 1440px` centred), two-column body 720px / 1fr with 54px gap, hero text left + 644×322 illustration right, four card columns, login panel 388px over the gradient. |
| 1024–1279px | Gutters 40px; body columns `minmax(0,1fr) minmax(360px,440px)`; product nav links shrink to 16px and may scroll horizontally; hero illustration scales to the column (`max-width:100%`, aspect 2:1). |
| 768–1023px (tablet) | **Single column**: panel ("Make a transfer") stacks **above** account cards and activity (the task is primary); hero illustration hidden or under the copy; card offers 2×2; login panel full width inside hero with the card grid below it (hero height auto). Utility nav right-hand links collapse into a "More" menu. |
| < 768px (mobile) | Gutters 16px; FDIC bar text wraps (two lines allowed); masthead = logo + hamburger (product + utility nav in a drawer) + Log out; `FieldRow` pairs stack; `TransferSummary` becomes a definition list (label above value, value left-aligned, tabular numerals); activity table becomes stacked cards (date/confirmation header, from → to, status, amount) or horizontally scrollable with a sticky first column; buttons full width; cookie notice bottom sheet; confirmation action buttons stack. |

General: fluid type via `clamp()` for the 64px/38px hero headings (min 32px); minimum touch target 44×44; `prefers-reduced-motion` respected; print stylesheet for the confirmation page (hide nav/footer, keep details table) to honour the legacy "Print" action.

---

## 12. Decisions / assumptions made in this spec

1. **Activity table dates**: the JSP asks for `MM/dd/yyyy` (`transfer.jsp:L61,L65`) but the running legacy app renders ISO `yyyy-MM-dd`. Decision: the rebuild displays `MM/dd/yyyy` (the documented intent, consistent with the confirmation "Submitted" timestamp) and records this as a deliberate non-preservation in `docs/05-summary.md`. If exact visual parity is required for the recording, render ISO.
2. **Roboto** is declared but never loaded; the rebuild self-hosts Roboto (OFL) so the stack actually resolves to its first choice.
3. **Dead links**: all `href="#"` items are kept as visible nav text for look-parity but implemented as non-navigating, `aria-disabled` items (or omitted on mobile) rather than `href="#"`.
4. **Cookie notice** dismissal is persisted (legacy re-shows every load); content unchanged.
5. **Footer stamp** "OLB-XFR 4.7.12 · node olbweb01a · {timestamp}" is kept verbatim in form, with the version/node coming from the API's build info so the demo can show the new stack's identity if desired.
6. **`error.xfr.tier.notowned`** is never raised by legacy; the rebuild keeps the tier selector freely selectable (legacy behaviour) — the backend analyst may decide otherwise in `01-acceptance-criteria.md`.
7. **Quote error presentation**: legacy shows one global red line and keeps stale summary values. Rebuild keeps the stale values (same UX) but also marks the offending field; the message text is identical.
8. **Narrow layouts** are new design (legacy has none); §11 is the proposal, with the transfer panel placed first on small screens.
9. Seed name discrepancy: README says "Jordan Reyes", seed/observed is **Jordan Rivera** (`seed.sql:L2-3`); header shows only "Welcome, Jordan".
10. Screenshots were taken with Chromium (Playwright) at 1600px; legacy was designed for 1280–1920px desktop IE7+/FF3.6+ (`olb.css:L1`).
