# 01 — Acceptance criteria recovered from the legacy OLB Transfers Portal

**Source system:** `jennamansueto/bofa-portal` @ `main` (Struts 1.3.10 / JSP 2.1 / Tomcat 7 / HSQLDB 1.8, Java 7 source on JDK 8).
**Method:** read-only code analysis of every class under `src/main/java/com/bankofamerica/olb`, `struts-config.xml`, `web.xml`, `ApplicationResources.properties`, `schema.sql`, `seed.sql`, the JSPs and `olb.js`; every behaviour below was then exercised against the running legacy app (`./run.sh`, Fri 2026-10-09 ~08:43 ET, before the 8 PM cutoff) with `curl` to confirm the observed output. Where the code and the observed output disagree with what one would *expect* a bank to do, this document records what the code **does**; see §6 "Ambiguities / quirks preserved".

File references are `path:Lstart-Lend` relative to the legacy repo root. Shorthand used below:

| Short | File |
|---|---|
| `TransferService` | `src/main/java/com/bankofamerica/olb/service/TransferService.java` |
| `BusinessCalendar` | `src/main/java/com/bankofamerica/olb/service/BusinessCalendar.java` |
| `FeeSchedule` | `src/main/java/com/bankofamerica/olb/service/FeeSchedule.java` |
| `TransferQuote` | `src/main/java/com/bankofamerica/olb/service/TransferQuote.java` |
| `AuthService` | `src/main/java/com/bankofamerica/olb/service/AuthService.java` |
| `Money` | `src/main/java/com/bankofamerica/olb/util/Money.java` |
| `TransferDAO` / `AccountDAO` / `CustomerDAO` / `FeeScheduleDAO` | `src/main/java/com/bankofamerica/olb/dao/*.java` |
| `Account` / `Customer` / `Transfer` | `src/main/java/com/bankofamerica/olb/model/*.java` |
| `AuthFilter` / `StartupListener` | `src/main/java/com/bankofamerica/olb/web/*.java` |
| `LoginAction` / `LogoutAction` / `TransferViewAction` / `TransferQuoteAction` / `TransferSubmitAction` / `TransferConfirmAction` | `src/main/java/com/bankofamerica/olb/action/*.java` |
| `LoginForm` / `TransferForm` | `src/main/java/com/bankofamerica/olb/form/*.java` |
| `messages` | `src/main/resources/ApplicationResources.properties` |
| `schema.sql` / `seed.sql` | `src/main/resources/sql/*.sql` |
| `struts-config.xml` / `web.xml` | `src/main/webapp/WEB-INF/*.xml` |
| `transfer.jsp` / `confirm.jsp` / `error.jsp` / `index.jsp` | `src/main/webapp/WEB-INF/jsp/*.jsp`, `src/main/webapp/index.jsp` |
| `olb.js` | `src/main/webapp/js/olb.js` |

---

## 1. Reference data (seeded values every criterion relies on)

### 1.1 Customers — `OLB_CUST` (`seed.sql:L2-L5`, DDL `schema.sql:L7-L18`)

| CUST_ID | OLB_USER_ID | Password (MD5 `2ac9cb7dc02b3c0083eb70898e549b63`) | Name | REL_TIER_CD | FAIL_CNT | STAT_CD |
|---|---|---|---|---|---|---|
| 100042 | `demo.user` | `Password1` | Jordan Rivera | `10` (Preferred Rewards Gold) | 0 | `A` |
| 100077 | `sam.chen` | `Password1` | Sam Chen | `00` (Standard) | 0 | `A` |

User-ID lookup is case-insensitive (`UPPER(OLB_USER_ID) = UPPER(?)`, `CustomerDAO:L14-L15`). `STAT_CD` values used by code: `A` active, `L` locked (`CustomerDAO:L52-L54`, `AuthService:L27`).

### 1.2 Accounts — `OLB_ACCT` (`seed.sql:L7-L12`, DDL `schema.sql:L20-L31`)

| ACCT_ID | CUST_ID | ACCT_TYP_CD | PROD_NM | LAST4 | CUR_BAL_CENTS | AVL_BAL_CENTS | Dollars | EXT_BANK_NM | SEQ_NO | STAT_CD |
|---|---|---|---|---|---|---|---|---|---|---|
| `ACCT-1001` | 100042 | `DDA` (checking) | Advantage Plus Banking - Checking | 1001 | 421538 | 421538 | $4,215.38 | – | 1 | `A` |
| `ACCT-1002` | 100042 | `SAV` (savings) | Advantage Savings | 1002 | 1294000 | 1294000 | $12,940.00 | – | 2 | `A` |
| `ACCT-1003` | 100042 | `EXT` (external) | Chase Total Checking | 4432 | 0 | 0 | $0.00 | JPMorgan Chase Bank, N.A. | 3 | `A` |
| `ACCT-2001` | 100077 | `DDA` | Advantage SafeBalance Banking | 2001 | 88012 | 88012 | $880.12 | – | 1 | `A` |
| `ACCT-2002` | 100077 | `SAV` | Advantage Savings | 2002 | 250000 | 250000 | $2,500.00 | – | 2 | `A` |

Display label (`Account.getDisplayName()`, `Account:L46-L53`): `<PROD_NM> ...<LAST4>`, prefixed with `<EXT_BANK_NM> - ` for external accounts, e.g. `Advantage Plus Banking - Checking ...1001`, `JPMorgan Chase Bank, N.A. - Chase Total Checking ...4432`. Only `STAT_CD='A'` accounts are ever loaded (`AccountDAO:L22`, `L37`); there is no seeded closed account, so "closed" is tested by flipping `STAT_CD` to any other value.

### 1.3 Fee / limit matrix — `OLB_FEE_SCHED` (`seed.sql:L14-L27`, DDL `schema.sql:L53-L60`)

All money columns are **BIGINT cents** (`schema.sql:L4`). Column order in the INSERTs is `(XFR_TYP_CD, REL_TIER_CD, FEE_CENTS, DAILY_LIM_CENTS, PER_TXN_LIM_CENTS, EFF_DT)`. Lookup is `WHERE XFR_TYP_CD=? AND REL_TIER_CD=? AND EFF_DT <= CURRENT_DATE` (`FeeScheduleDAO:L19`); all rows are effective `2019-01-01`.

| Type | Tier | Tier name (`messages:L31-L34`) | FEE_CENTS | Fee | DAILY_LIM_CENTS | Daily limit | PER_TXN_LIM_CENTS | Per-txn limit |
|---|---|---|---|---|---|---|---|---|
| INT | 00 | Standard | 0 | $0.00 | 99,999,999 | $999,999.99 | 9,999,999 | $99,999.99 |
| INT | 10 | Preferred Rewards Gold | 0 | $0.00 | 99,999,999 | $999,999.99 | 9,999,999 | $99,999.99 |
| INT | 20 | Preferred Rewards Platinum | 0 | $0.00 | 99,999,999 | $999,999.99 | 9,999,999 | $99,999.99 |
| INT | 30 | Preferred Rewards Platinum Honors | 0 | $0.00 | 99,999,999 | $999,999.99 | 9,999,999 | $99,999.99 |
| EXS | 00 | Standard | 0 | $0.00 | 350,000 | $3,500.00 | 350,000 | $3,500.00 |
| EXS | 10 | Preferred Rewards Gold | 0 | $0.00 | 500,000 | $5,000.00 | 500,000 | $5,000.00 |
| EXS | 20 | Preferred Rewards Platinum | 0 | $0.00 | 1,000,000 | $10,000.00 | 1,000,000 | $10,000.00 |
| EXS | 30 | Preferred Rewards Platinum Honors | 0 | $0.00 | 2,500,000 | $25,000.00 | 2,500,000 | $25,000.00 |
| EXN | 00 | Standard | **300** | **$3.00** | 350,000 | $3,500.00 | 350,000 | $3,500.00 |
| EXN | 10 | Preferred Rewards Gold | 0 | $0.00 | 500,000 | $5,000.00 | 500,000 | $5,000.00 |
| EXN | 20 | Preferred Rewards Platinum | 0 | $0.00 | 1,000,000 | $10,000.00 | 1,000,000 | $10,000.00 |
| EXN | 30 | Preferred Rewards Platinum Honors | 0 | $0.00 | 2,500,000 | $25,000.00 | 2,500,000 | $25,000.00 |

The only non-zero fee in the whole matrix is **EXN / Standard = $3.00**. For INT the code ignores `PER_TXN_LIM_CENTS` and uses the hard-coded `INTERNAL_PER_TXN_CAP_CENTS = 9999999` ($99,999.99) (`TransferService:L46`, `L177`); the INT daily limit column is never read. Type labels (`messages:L36-L38`): `INT` = "Between your Bank of America accounts", `EXS` = "3 business days (no fee)", `EXN` = "Next business day".

### 1.4 Bank holidays — `OLB_BANK_HOL` (`seed.sql:L29-L52`)

| 2026 | | 2027 | |
|---|---|---|---|
| 2026-01-01 | New Year's Day | 2027-01-01 | New Year's Day |
| 2026-01-19 | Martin Luther King Jr. Day | 2027-01-18 | Martin Luther King Jr. Day |
| 2026-02-16 | Presidents Day | 2027-02-15 | Presidents Day |
| 2026-05-25 | Memorial Day | 2027-05-31 | Memorial Day |
| 2026-06-19 | Juneteenth | 2027-06-18 | Juneteenth (observed) |
| 2026-07-03 | Independence Day (observed) | 2027-07-05 | Independence Day (observed) |
| 2026-09-07 | Labor Day | 2027-09-06 | Labor Day |
| **2026-10-12** | **Columbus Day** | 2027-10-11 | Columbus Day |
| 2026-11-11 | Veterans Day | 2027-11-11 | Veterans Day |
| 2026-11-26 | Thanksgiving Day | 2027-11-25 | Thanksgiving Day |
| 2026-12-25 | Christmas Day | 2027-12-24 | Christmas Day (observed) |

Non-business days = Saturday, Sunday, or any date in this table (`BusinessCalendar:L39-L45`). Dates outside 2026–2027 have no holidays (weekends only).

### 1.5 Seeded transfer history — `OLB_XFR` (`seed.sql:L54-L60`)

| CONF_NBR | FROM → TO | AMT | FEE | TYPE | TIER | FREQ | SCHED_DT | POST_DT | STAT | MEMO | CRT_TS |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `XFR260928-000014` | ACCT-1001 → ACCT-1002 | $250.00 | $0 | INT | 10 | O | 2026-09-28 | 2026-09-28 | P | Vacation fund | 2026-09-28 09:12:44 |
| `XFR261001-000203` | ACCT-1002 → ACCT-1001 | $1,200.00 | $0 | INT | 10 | M | 2026-10-01 | 2026-10-01 | P | Rent | 2026-10-01 06:00:02 |
| `XFR261006-000091` | ACCT-1001 → ACCT-1003 | $500.00 | $0 | EXS | 10 | O | 2026-10-06 | 2026-10-09 | S | – | 2026-10-06 18:40:19 |

`OLB_CONF_SEQ` is seeded **empty**, so the first transfer created on any day gets sequence `000001` regardless of history (`TransferDAO:L123-L148`). Status labels (`messages:L44-L46`): `P` Posted, `S` Scheduled, `R` Rejected (nothing in the web app ever writes `R`; it is only *excluded* by queries).

### 1.6 Constants

| Constant | Value | Source |
|---|---|---|
| Posting cutoff | 20:00 (8 PM) `America/New_York`, `HOUR_OF_DAY >= 20` | `web.xml:L25-L28`, `StartupListener:L40-L41`, `BusinessCalendar:L34-L37` |
| Reg D monthly limit | 6 outbound per calendar month from a `SAV` account | `TransferService:L45`, `L193-L197` |
| Internal per-txn cap | 9,999,999 cents = $99,999.99 | `TransferService:L46` |
| Lockout threshold | 3 consecutive failed sign-ins | `CustomerDAO:L52-L54`, `AuthService:L30` |
| Session timeout | 10 minutes | `web.xml:L57-L59` |
| Recent-activity rows | 10, newest first | `TransferViewAction:L54`, `TransferDAO:L71-L87` |
| EXS delivery | +3 business days from effective start | `TransferService:L206` |
| EXN delivery | +1 business day from effective start | `TransferService:L206` |
| "Save user ID" cookie | `olb_uid`, 365 days, path = context root | `LoginAction:L22`, `L53-L56` |
| Default draft | From = first non-EXT account, To = second non-EXT, Amount `500`, tier = customer's stored tier, delivery `EXS`, frequency `O` | `TransferViewAction:L30-L42`, `TransferForm:L15-L16` |

---

## 2. Acceptance criteria

Each criterion is Given/When/Then, followed by its legacy source and the concrete seeded values. "Submit" means `POST /secure/transferSubmit.do`; "Quote" means `POST /secure/quote.do`; both run the identical validation chain `TransferService.buildQuote` (`L135-L220`), so every validation AC applies to both endpoints (quote returns `{"ok":false,"message":…}`, submit re-renders `transfer.jsp` with the message in `<div class="olb-errbox"><ul><li>…</li></ul></div>`, `messages:L5-L8`). Validation order is exactly: amount required → amount format → amount ≥ $0.01 → accounts present → from ≠ to → account ownership/active → EXT→EXT → tier valid → frequency valid → date format → date not past → type derivation → fee row found → per-txn limit → daily external limit → available balance → Reg D (`TransferService:L138-L197`). The first failing rule's message is the only one shown.

### Authentication & session

**AC-01 — Successful sign-in creates a fresh session and lands on Transfer Money**
Given customer `demo.user` / `Password1` (tier `10`, `STAT_CD='A'`), When they POST `userId=demo.user&password=Password1` to `/login.do`, Then: the MD5 of the password matches `PSWD_HASH` (case-insensitive hex compare); `LAST_LOGIN_TS` is set to now and `FAIL_CNT` is reset to 0; any pre-existing HTTP session is invalidated and a **new** session is created (JSESSIONID changes — verified: `85C2…` → `84EC…`) holding the `Customer` under attribute `olb.customer`; the response is `302 Location: /secure/transfer.do`.
Source: `LoginAction:L24-L59`, `AuthService:L23-L34`, `CustomerDAO:L43-L48`, `struts-config.xml:L27`. Also accepted: user ID in any case (`DEMO.USER` works, `CustomerDAO:L14`) and with surrounding whitespace (trimmed `LoginAction:L35`); the password is **not** trimmed.

**AC-02 — Blank credentials are rejected before any lookup**
Given the sign-in page, When `userId` or `password` is blank/whitespace, Then no DB lookup and no fail-count increment occurs, and the page re-renders (HTTP 200, URL `/login.do`, forward not redirect) with the error **"Please enter your User ID and Password."**
Source: `LoginAction:L29-L32`, `L62`, `messages:L10`, `struts-config.xml:L28`.

**AC-03 — Wrong password or unknown user shows the generic invalid message and increments the counter**
Given `sam.chen` with `FAIL_CNT=0`, When they sign in with a wrong password, Then `FAIL_CNT` becomes 1 (`STAT_CD` stays `A`) and the page shows **"The User ID or Password you entered does not match our records. Please try again."** (HTTP 200 on `/login.do`). For an unknown user ID the same message is shown and nothing is persisted.
Source: `AuthService:L26-L31`, `CustomerDAO:L52-L54`, `LoginAction:L38-L45`, `messages:L11`.

**AC-04 — Third consecutive failure locks the ID immediately and permanently (3-strike lockout)**
Given `sam.chen` with `FAIL_CNT=2`, When a third wrong password is submitted, Then the UPDATE sets `FAIL_CNT=3` and `STAT_CD='L'`, and *that same response* already shows **"Your account is temporarily locked after too many unsuccessful sign-in attempts. Please call 800.432.1000."** (the outcome is computed as `failCount(2)+1 >= 3`). Every later attempt — including with the **correct** password — returns the same locked message without touching `FAIL_CNT`. Lock state is persisted in `OLB_CUST`; there is **no** time-based or self-service unlock in the application (comment: "Unlock is a CICS OLBM02 function"). Because the demo DB is in-memory, restarting the app is the only reset.
Source: `AuthService:L26-L31`, `CustomerDAO:L52-L54`, `messages:L12`. Verified: attempts 1–2 → invalid; 3, 4 and correct-password → locked.

**AC-05 — A successful sign-in resets the failure counter**
Given `demo.user` with `FAIL_CNT=2`, When they sign in correctly, Then `FAIL_CNT` is set to 0; two further failures therefore do **not** lock the account and a subsequent correct sign-in succeeds (verified: 2 failures → success → 2 failures → success).
Source: `CustomerDAO:L48`.

**AC-06 — "Save user ID" cookie**
Given a successful sign-in, When `saveUserId=true` was checked, Then cookie `olb_uid=<canonical OLB_USER_ID from DB>` (e.g. `demo.user` even if `DEMO.USER` was typed) is set with Max-Age 365 days, path `/` (context root). When unchecked, `olb_uid=""` with Max-Age 0 is sent, deleting it. `index.jsp` pre-fills the User ID field from this cookie.
Source: `LoginAction:L22`, `L53-L56`, `index.jsp:L9`, `L34`, `L37`.

**AC-07 — Unauthenticated access to any `/secure/*` URL redirects to sign-in with the "expired" banner**
Given no session or a session without `olb.customer`, When any `/secure/*` URL is requested (GET or POST, HTML or the JSON quote endpoint), Then the response is `302 Location: <ctx>/index.jsp?expired=1` with header `Cache-Control: no-cache, no-store`, and `index.jsp?expired=1` renders the box **"For your security, your session has ended due to inactivity. Please log in again."** — even for a user who never signed in.
Source: `AuthFilter:L24-L29`, `web.xml:L34-L41`, `index.jsp:L10`, `L30`, `messages:L13`.

**AC-08 — Session timeout is 10 minutes of inactivity**
Given an authenticated session, When 10 minutes pass without a request, Then the container invalidates it and the next `/secure/*` request behaves as AC-07.
Source: `web.xml:L57-L59`.

**AC-09 — Logout invalidates the session and returns to the public landing page**
Given an authenticated session, When `/logout.do` is requested, Then the session is invalidated and the response is `302 Location: /index.jsp` (no `expired` flag; `olb_uid` cookie is left untouched). A following `/secure/transfer.do` request then redirects per AC-07.
Source: `LogoutAction:L15-L16`, `struts-config.xml:L31-L33`.

**AC-10 — Authenticated pages are never cached**
Given an authenticated request to `/secure/*`, Then the response carries no-cache headers. `AuthFilter` sets `Cache-Control: no-cache, no-store, must-revalidate` and `Pragma: no-cache`; the Struts controller (`nocache="true"`) then overwrites them on every `*.do` response — including `/login.do` — so the headers actually observed are `Pragma: No-cache`, `Cache-Control: no-cache,no-store,max-age=0`, `Expires: Thu, 01 Jan 1970 00:00:00 GMT`. Either form satisfies the intent "no caching".
Source: `AuthFilter:L31-L32`, `struts-config.xml:L60`. Verified on `/secure/transfer.do` and `/login.do`.

### Transfer page defaults & content

**AC-11 — Transfer Money page initial state**
Given `demo.user` signs in for the first time, When `/secure/transfer.do` renders, Then: From = `ACCT-1001` (first non-external by `SEQ_NO`), To = `ACCT-1002` (second non-external), Amount = `500`, Relationship tier = customer's stored tier `10` "Preferred Rewards Gold", Delivery = `EXS` (row hidden because neither account is external), Frequency = `O` "One time", Send-on blank, Memo blank; the balance cards show only non-external accounts (`$4,215.38` Advantage Plus Banking - Checking ...1001 / ACCT-1001; `$12,940.00` Advantage Savings ...1002 / ACCT-1002), each showing an extra "Available $x" line **only** when available ≠ current; the Transfer Summary is pre-priced server-side: From/To labels, Amount `$500.00`, Fee `No fee`, Type "Between your Bank of America accounts", Tier "Preferred Rewards Gold", Delivery date `Fri, Oct 9, 2026` (format `EEE, MMM d, yyyy`), Total debit `$500.00`. The From/To selects list **all** active accounts including the external one, each option carrying `data-ext="Y|N"`.
Source: `TransferViewAction:L30-L54`, `transfer.jsp:L48-L55`, `L80-L132`, `TransferForm:L15-L16`. Verified.

**AC-12 — Recent activity list**
Given the customer's transfers, When the page renders, Then at most **10** rows are shown ordered by `CRT_TS DESC, XFR_ID DESC`, with columns DATE (`SCHED_DT` as `MM/dd/yyyy`), CONFIRMATION, FROM, TO (joined labels; `(closed account)` if the account row no longer exists/was deleted — note the join is on `ACCT_ID` without a status filter, so a *closed* account still shows its label), STATUS (`Posted`/`Scheduled`/`Rejected`; for `S` the post date is appended as ` · MM/dd`), AMOUNT (`$x,xxx.xx`, plus a second line `+ $3.00 fee` when `FEE_CENTS > 0`). On first login the three seeded rows appear in order `XFR261006-000091` ($500.00, Scheduled · 10/09), `XFR261001-000203` ($1,200.00, Posted), `XFR260928-000014` ($250.00, Posted). All transfers of the customer are listed regardless of status; the list is per customer, not per account.
Source: `TransferDAO:L71-L87`, `L150-L175`, `transfer.jsp:L57-L69`.

**AC-13 — Form state persists across requests (session-scoped form)**
Given the customer changes From/To/tier/delivery/frequency, When they navigate away and back to `/secure/transfer.do`, Then those selections are retained (the `transferForm` bean is session-scoped; `reset()` is a no-op). After a **successful** submit, `amount`, `memo` and `scheduledDate` are cleared but From, To, tier, delivery and frequency are retained. After a **failed** submit, every entered value is retained.
Source: `struts-config.xml:L35-L47`, `TransferForm:L37-L39`, `TransferSubmitAction:L29-L33`.

### Amount validation (R1)

**AC-14 — Amount is required**
Given any accounts, When `amount` is empty or whitespace, Then the error is **"Please enter an amount."**
Source: `TransferService:L139`, `messages:L15`.

**AC-15 — Amount parsing accepts `$`, thousands separators and up to 2 decimals**
Given input strings, When parsed, Then: `"1,250.00"` → 125000¢ ($1,250.00); `"$1,250.5"` → 125050¢ ($1,250.50); `"1250."` → 125000¢; `"500"` → 50000¢; `"4215.38"` → 421538¢. Parsing: trim, strip every `$` and `,`, then must match `-?\d{1,13}(\.\d{0,2})?`. Anything else — `".50"` (no leading digit), `"1.005"` (3 decimals), `"abc"`, `"1 000"`, `"1,2,3"` is fine (commas stripped), `"12345678901234"` (14 digits) — yields **"Please enter a valid dollar amount (for example, 250.00)."**
Source: `Money:L38-L52`, `TransferService:L140-L141`, `messages:L16`. Verified for `1,250.00`, `$1,250.5`, `1250.`, `.50`, `1.005`.

**AC-16 — Amount must be at least one cent**
Given a parseable amount, When it is `0`, `0.00` or negative (e.g. `-5` parses to −500¢ because the regex allows a leading minus), Then the error is **"The transfer amount must be at least $0.01."**
Source: `TransferService:L142`, `messages:L17`. Verified for `0` and `-5`.

### Account validation (R2)

**AC-17 — From and To must differ**
Given `fromAcctId == toAcctId` (e.g. `ACCT-1001`→`ACCT-1001`, or `ACCT-1003`→`ACCT-1003`), Then **"The From and To accounts must be different."** This check runs **before** ownership/EXT→EXT checks (so same-external-account shows this message, not the EXT→EXT one).
Source: `TransferService:L146`, `messages:L18`.

**AC-18 — Both accounts must exist, be active (`STAT_CD='A'`) and belong to the signed-in customer**
Given `demo.user` (100042), When either account ID is missing (null), unknown, has `STAT_CD <> 'A'` (closed), or belongs to another customer (e.g. `ACCT-1001`→`ACCT-2001`, Sam Chen's), Then **"Please select valid From and To accounts."** Closed accounts are never offered in the dropdowns and are rejected if posted anyway. Note `findById` filters on `STAT_CD='A'`, so a closed account is indistinguishable from a non-existent one.
Source: `TransferService:L145`, `L147-L151`, `AccountDAO:L34-L44`, `messages:L19`. Verified for the cross-customer case.

**AC-19 — External-to-external is not supported**
Given both From and To are `EXT` accounts (requires a second linked external account; not seeded — add one to test), Then **"Transfers between two external accounts are not supported."**
Source: `TransferService:L152`, `messages:L24`.

### Tier, frequency, date inputs

**AC-20 — Submitted tier overrides the customer's stored tier (not cross-checked)**
Given `demo.user` whose stored `REL_TIER_CD` is `10`, When the form is submitted with `tierCode=00`, Then the server **uses `00`** for fee/limit lookup, stores `REL_TIER_CD='00'` on the `OLB_XFR` row, and the confirmation page shows "Relationship tier: Standard". The only validation is membership in `{00,10,20,30}`; a missing or other value (e.g. `99`, or no `tierCode` parameter at all on `/secure/quote.do`) yields **"Please select a relationship tier."** The message key `error.xfr.tier.notowned` ("The selected relationship tier is not on file for this customer.") exists in the bundle but is **never used** by any code path. The stored tier is only used as the *default* selection when the session form has no tier yet.
Source: `TransferService:L154`, `L173-L174`, `L216`, `FeeSchedule:L17-L20`, `TransferViewAction:L42`, `TransferSubmitAction:L29` (comment "keep the tier choice"), `transfer.jsp:L92-L98`, `messages:L27`, `L29`. Verified: INT with `tierCode=00` → confirmation shows "Standard"; `tierCode=99` and absent tier → "Please select a relationship tier."

**AC-21 — Fee row missing yields the same tier message**
Given a valid tier code but no `OLB_FEE_SCHED` row for `(type, tier)` with `EFF_DT <= CURRENT_DATE` (not reachable with seed data; test by deleting a row or setting `EFF_DT` in the future), Then **"Please select a relationship tier."**
Source: `TransferService:L173-L174`, `FeeScheduleDAO:L15-L28`.

**AC-22 — Frequency must be `O`, `W` or `M`; it is stored but never acted upon**
Given a frequency value, When it is not exactly `O` (One time), `W` (Weekly) or `M` (Monthly) — e.g. `D` or absent on a request-scoped quote — Then **"Please select a frequency."** When valid, `FREQ_CD` is stored on the transfer and shown on the confirmation ("Frequency: Weekly"), but **no recurring instances are generated**; a `W`/`M` transfer behaves exactly like a one-time transfer on its scheduled date.
Source: `TransferService:L155-L157`, `L87-L100`, `messages:L28`, `L40-L42`, `confirm.jsp:L36`. Verified: `frequency=W` on 10/20/2026 → single scheduled row, confirmation says "Weekly".

**AC-23 — Scheduled ("Send on") date format and defaulting**
Given `scheduledDate`, When blank → the transfer is scheduled for **today** (Eastern calendar date). When non-blank it must parse strictly as `MM/dd/yyyy` (non-lenient, ET): `10/20/2026` OK; `2026-10-20`, `10/32/2026`, `10/9/26`… → **"Please enter the transfer date as MM/DD/YYYY."** (the quote JSON encodes this as `MM\/DD\/YYYY`).
Source: `TransferService:L161`, `L222-L235`, `messages:L26`.

**AC-24 — Scheduled date cannot be in the past**
Given today is 2026-10-09 ET, When `scheduledDate=10/08/2026`, Then **"The transfer date cannot be in the past."** Today itself is allowed. There is **no upper bound** on how far in the future.
Source: `TransferService:L162`, `messages:L25`.

### Type derivation, fees & limits (R3, R4, R6)

**AC-25 — Transfer type derivation**
Given From and To, Then type is `INT` when **neither** is `EXT`; otherwise (either side external, including inbound `ACCT-1003`→`ACCT-1001`) type is `EXN` when `delivery == "EXN"` and **`EXS` for any other delivery value** (`EXS`, absent, or garbage such as `XYZ`). The Delivery dropdown is only shown client-side when an external account is selected.
Source: `TransferService:L164-L170`, `Transfer:L12-L14`, `olb.js:L8-L9`. Verified: `delivery=XYZ` → "3 business days (no fee)".

**AC-26 — Fee by (type, tier)**
Given the matrix in §1.3, When quoting, Then fee = `FEE_CENTS`: Gold `demo.user` EXS and EXN → `No fee`; Standard (`00`) EXS → `No fee`; Standard EXN → **`$3.00`** and total = amount + $3.00 (e.g. $1,250.00 → total `$1,253.00`); all INT → `No fee`. Fee display is the literal string `No fee` when 0, else `$x.xx` (quote, summary and confirmation).
Source: `TransferService:L173`, `L213`, `TransferQuote:L40`, `confirm.jsp:L33`, `transfer.jsp:L128`. Verified.

**AC-27 — Per-transaction limit**
Given type/tier, When `amount > PER_TXN_LIM_CENTS` (external) or `> 9,999,999¢` (internal, hard-coded regardless of tier), Then **"This transfer exceeds the per-transfer limit of {0} for your relationship tier."** with `{0}` formatted as `$3,500.00` / `$5,000.00` / `$10,000.00` / `$25,000.00` / `$99,999.99`. Equal to the limit is allowed. Checked **before** daily, balance and Reg D rules. Examples: Standard EXN `$3,500.01` → error, `$3,500.00` → OK; Gold inbound `ACCT-1003`→`ACCT-1001` `$50,000` → "$5,000.00" error; INT `$100,000` → "$99,999.99" error even for Platinum Honors.
Source: `TransferService:L176-L180`, `L46`, `messages:L21`. Verified all four examples.

**AC-28 — Daily external limit (same-day only, counts both directions)**
Given type is `EXS`/`EXN`, Then `usedToday = SUM(AMT_CENTS)` of the customer's `EXS`+`EXN` rows with `STAT_CD <> 'R'` and `SCHED_DT = today` (fees excluded; **inbound** external transfers count too). When the transfer is scheduled for **today** and `usedToday + amount > DAILY_LIM_CENTS`, Then **"This transfer would exceed your daily external transfer limit of {0}. Today''s external transfers total {1}."** — rendered literally with the doubled apostrophe `Today''s` (see §6). Example: Standard tier after a $200 EXN out and $300 EXS in today, a $3,100 EXS → "…limit of $3,500.00. Today''s external transfers total $500.00." A **future-dated** external transfer skips this check entirely (same $3,100 dated 10/14/2026 from savings → `ok:true`). The seeded `XFR261006-000091` (sched 10/06) does not count on 10/09.
Source: `TransferService:L181-L188`, `TransferDAO:L90-L103`, `messages:L22`. Verified both branches.

### Balance & Reg D (R5, R7)

**AC-29 — Amount plus fee must not exceed the From account's available balance (internal From only)**
Given From is `DDA`/`SAV`, When `amount + fee > AVL_BAL_CENTS`, Then **"The amount plus any fee exceeds the available balance in your From account."** Equal is allowed (`$4,215.38` from ACCT-1001 OK; `$4,215.39` fails). The check uses **available**, not current, balance, so earlier same-day external holds reduce capacity. When From is `EXT` the check is skipped (balance of the external account is unknown/0). Checked after per-txn and daily limits.
Source: `TransferService:L189-L192`, `messages:L20`. Verified.

**AC-30 — Regulation D: max 6 outbound transfers per calendar month from a savings account**
Given From is `SAV`, Then `n = COUNT(*)` of `OLB_XFR` rows with `FROM_ACCT_ID = from`, `STAT_CD <> 'R'`, `SCHED_DT` within the **calendar month of the scheduled date** (`[firstOfMonth(sched), firstOfNextMonth(sched))`). When `n >= 6`, Then **"You have reached the limit of 6 transfers from your savings account this statement cycle (Regulation D)."** Counts INT and external alike, both posted and scheduled, regardless of who initiated. Inbound transfers *to* savings do not count. Seeded: ACCT-1002 already has 1 outbound in Oct 2026 (`XFR261001-000203`), so five more October transfers succeed and the **7th** (6th new) fails; scheduling for `11/02/2026` succeeds because November has 0. Checked last.
Source: `TransferService:L45`, `L193-L197`, `TransferDAO:L106-L120`, `BusinessCalendar:L87-L100`, `messages:L23`. Verified: 1 seeded + 1 future-dated (10/20) + 4 same-day = 6 → the next fails.

### Dating & delivery (R8, R9)

**AC-31 — Internal same-day transfer posts immediately**
Given INT with `scheduledDate` blank or today, When submitted, Then in one DB transaction: `STAT_CD='P'`, From `CUR_BAL_CENTS` and `AVL_BAL_CENTS` both −(amount+fee), To `CUR_BAL_CENTS` and `AVL_BAL_CENTS` both +amount, `POST_DT = SCHED_DT = today`. Confirmation shows "Status: Posted" and the row label "**Posted** Friday, October 9, 2026", and "Updated balances" reflect the move (e.g. $1,250 from ACCT-1001 to ACCT-1002 → `$2,965.38` / `$14,190.00`). Footer note: "Transfers between your Bank of America accounts post the same day."
Source: `TransferService:L102-L107`, `L201-L202`, `AccountDAO:L46-L57`, `confirm.jsp:L37-L38`, `L43`, `messages:L49`. Verified.

**AC-32 — Future-dated internal transfer is scheduled, no balance movement**
Given INT with `scheduledDate` after today (e.g. `10/20/2026`), When submitted, Then `STAT_CD='S'`, `SCHED_DT = POST_DT = 2026-10-20`, **no** balance or hold change on either account, confirmation shows "Status: Scheduled" and "**Delivery date** Tuesday, October 20, 2026". Internal delivery date is the scheduled date itself — no business-day roll-forward (an INT dated Sat 10/10/2026 is "delivered" 10/10). The web app contains no batch that later posts it (comment references nightly TRNPOST).
Source: `TransferService:L102-L109`, `L201-L202`. Verified.

**AC-33 — External transfer delivery dates: EXS +3 / EXN +1 business days**
Given an external transfer requested on Fri 2026-10-09 **before 8 PM ET** with blank date, Then start = 10/09 and: EXN → next business day skipping Sat 10/10, Sun 10/11, Columbus Day Mon 10/12 → **Tue, Oct 13, 2026**; EXS → 3 business days → 10/13, 10/14, **Thu, Oct 15, 2026**. Quote/summary show `EEE, MMM d, yyyy`; confirmation shows `EEEE, MMMM d, yyyy` ("Tuesday, October 13, 2026"); `POST_DT` stores the delivery date, `SCHED_DT` the request date. Other examples (verified): EXN dated Wed 11/25/2026 → skips Thanksgiving 11/26 → **Fri, Nov 27, 2026**; EXS dated Wed 10/14/2026 → Mon, Oct 19, 2026.
Source: `TransferService:L203-L208`, `BusinessCalendar:L39-L45`, `L59-L67`, `seed.sql:L37`, `L39`. Verified.

**AC-34 — Future-dated external on a non-business day rolls the start forward first**
Given EXN dated Sat `10/10/2026`, Then effective start rolls forward to Tue 10/13 (first business day ≥ 10/10), delivery = **Wed, Oct 14, 2026**; EXS dated 10/10 → **Fri, Oct 16, 2026**.
Source: `BusinessCalendar:L74-L78`, `L53-L57`. Verified.

**AC-35 — 8 PM ET cutoff moves the effective start date for same-day external requests**
Given an external transfer scheduled for **today** and the current Eastern wall-clock hour ≥ 20, Then start = today + 1 calendar day, then rolled forward to a business day. On Fri 10/09 after 8 PM: start → Sat 10/10 → rolls to Tue 10/13; EXN delivers **Wed 10/14**, EXS **Fri 10/16**. The cutoff is **not** applied to future-dated requests (the `afterCutoff` flag is only true when `sched == today`), and INT is never affected by the cutoff. The clock is the server's clock in `America/New_York`.
Source: `TransferService:L204-L205`, `BusinessCalendar:L34-L37`, `L74-L78`, `web.xml:L25-L28`. Not time-travel-tested; derived from code.

**AC-36 — External transfers are always scheduled with an available-balance hold on the internal From account**
Given EXS/EXN (any date), When submitted, Then `STAT_CD='S'` always (never `P`), and if From is internal: `AVL_BAL_CENTS -= amount + fee`, `CUR_BAL_CENTS` unchanged (so the balance card gains an "Available $x" line, e.g. after a $200 + $3.00 EXN from ACCT-1001: current `$2,965.38`, **Available `$2,762.38`**). If From is external (inbound), **no** balance change on either account. Confirmation footer: "External transfers are sent via ACH and will arrive on the delivery date shown."
Source: `TransferService:L108-L117`, `AccountDAO:L46-L57`, `transfer.jsp:L53`, `confirm.jsp:L43`, `messages:L50`. Verified both.

### Persistence & confirmation (R10)

**AC-37 — Confirmation number `XFRyyMMdd-nnnnnn` with a daily sequence**
Given a submit on 2026-10-09 (ET date **today**, not the scheduled date), Then the number is `XFR261009-` + 6-digit zero-padded sequence from `OLB_CONF_SEQ` for `SEQ_DT = today` (insert 1 if absent, else +1); first of the day is `XFR261009-000001`, then `-000002`… The sequence is taken inside the submit transaction **after** all validation, so rejected transfers do not consume numbers. A future-dated transfer created today still gets today's prefix. The seeded history rows do not seed the sequence table. 16 chars total (`CONF_NBR CHAR(16)`).
Source: `TransferService:L100`, `L237-L244`, `TransferDAO:L123-L148`, `schema.sql:L68-L71`, `L35`. Verified `000001`…`000004`.

**AC-38 — Stored transfer row and memo handling**
Given a successful submit, Then one `OLB_XFR` row is inserted with `CUST_ID`, `FROM/TO_ACCT_ID`, `AMT_CENTS`, `FEE_CENTS`, `XFR_TYP_CD`, `REL_TIER_CD` (**submitted** tier), `FREQ_CD`, `SCHED_DT`, `POST_DT` (delivery date), `STAT_CD`, `MEMO` (trimmed; `NULL` when blank; UI max 60 chars = `VARCHAR(60)`), `CRT_TS` = now, `CRT_CHNL_CD` default `'OLB'`. The confirmation page shows a "Memo" row only when a memo was saved (`"  Test memo  "` → "Test memo"), HTML-escaped. Everything (balance updates, sequence, insert) commits atomically; any SQL failure rolls back and renders `error.jsp`.
Source: `TransferService:L87-L100`, `L118-L128`, `TransferDAO:L24-L53`, `schema.sql:L33-L50`, `confirm.jsp:L39`. Verified.

**AC-39 — Post-submit redirect and confirmation page**
Given a successful submit, Then session attribute `olb.lastConfirmation` = the new number and the response is `302 Location: /secure/transferConfirm.do` (PRG — refresh does not resubmit). `GET /secure/transferConfirm.do` (optionally `?conf=XFR…`) loads the transfer **for the signed-in customer only** and renders: heading "Your transfer has been submitted", "Confirmation number: XFR261009-000001", From, To, Amount, Fee (`No fee`/`$3.00`), Transfer type label, Relationship tier label, Frequency label, Status label, "Posted"/"Delivery date" + long date, Memo (optional), Total debit, "Submitted MM/dd/yyyy hh:mm a z via Online Banking." (ET, e.g. `10/09/2026 08:43 AM EDT`), plus an "Updated balances" column for non-external accounts, and links "Make another transfer" (→ `/secure/transfer.do`) and "Print". When `conf` is unknown, belongs to another customer, or there is no `olb.lastConfirmation`, the action redirects `302` to `/secure/transfer.do`. Seeded numbers (e.g. `?conf=XFR260928-000014`) are viewable by `demo.user`.
Source: `TransferSubmitAction:L28-L33`, `TransferConfirmAction:L20-L26`, `TransferDAO:L55-L69`, `confirm.jsp:L22-L59`, `struts-config.xml:L45-L52`, `messages:L48`. Verified.

**AC-40 — Failed submit re-renders the form in place with the error**
Given any validation failure on submit, Then HTTP 200 on URL `/secure/transferSubmit.do` (forward, not redirect) rendering `transfer.jsp` with `<div class="olb-errbox"><ul><li>MESSAGE</li></ul></div>` above the form, the accounts and the 10 recent transfers reloaded, all entered values retained (AC-13), and the server-side Transfer Summary shows "—" placeholders until `olb.js` re-quotes on load.
Source: `TransferSubmitAction:L35-L42`, `struts-config.xml:L46`, `transfer.jsp:L76`, `L124-L132`, `messages:L5-L8`, `olb.js:L27`. Verified.

**AC-41 — Live Transfer Summary refresh**
Given the transfer form, When any select/input changes (debounced 250 ms, `change`/`keyup`), Then `olb.js` POSTs the serialized form to `/secure/quote.do` and on `ok:true` replaces `#sFrom #sTo #sAmount #sFee #sType #sTier #sDelivery #sTotal`, hiding `#quoteErr`; on `ok:false` shows the message in `#quoteErr`. The Delivery row is shown only when the selected From or To option has `data-ext="Y"`. A submit button is guarded against double-click for 4 s.
Source: `olb.js:L6-L29`, `L32-L50`.

**AC-42 — Unexpected errors render the branded error page**
Given any uncaught exception (including `DataAccessException`) or a 404, Then `/WEB-INF/jsp/error.jsp` renders "We're sorry, Online Banking is temporarily unavailable." with "Please try again in a few minutes. If you continue to see this message, call us at 800.432.1000.", an `Error reference: ERR-<hex millis>` (plus ` · HTTP <code>` / exception class when present) and a "Return to sign in" link. For `/secure/quote.do` such an error yields HTML, not JSON.
Source: `struts-config.xml:L12-L14`, `web.xml:L65-L72`, `error.jsp:L12-L19`. Verified for 404.

---

## 3. `/secure/quote.do` JSON contract

Hand-rolled JSON (`TransferQuoteAction:L32-L57`); no JSON library. Requires an authenticated session (otherwise AC-07 redirect). HTTP status is **200 for both success and validation failure**.

**Request** — `POST` (what `olb.js` sends; Struts also accepts `GET`), `application/x-www-form-urlencoded`, same field names as the transfer form (`TransferForm`, request-scoped for this mapping so no values carry over from the session form):

| Param | Required | Notes |
|---|---|---|
| `fromAcctId` | yes | `ACCT-1001`, `ACCT-1002`, `ACCT-1003` |
| `toAcctId` | yes | |
| `amount` | yes | raw string, see AC-15 |
| `tierCode` | yes | `00`/`10`/`20`/`30`; **absent ⇒ error** (no default) |
| `delivery` | no | `EXN` ⇒ next-day; anything else/absent ⇒ `EXS` (form default `EXS`) |
| `frequency` | no | `O`/`W`/`M`; absent ⇒ form default `O` |
| `scheduledDate` | no | `MM/dd/yyyy`; blank ⇒ today |
| `memo` | ignored | serialized by the form but not used in the quote |

**Success response** — `Content-Type: application/json;charset=UTF-8`; all values are pre-formatted display strings:

```json
{"ok":true,
 "from":"Advantage Plus Banking - Checking ...1001",
 "to":"JPMorgan Chase Bank, N.A. - Chase Total Checking ...4432",
 "amount":"$1,250.00",
 "fee":"$3.00",
 "total":"$1,253.00",
 "type":"Next business day",
 "tier":"Standard",
 "delivery":"Tue, Oct 13, 2026"}
```

| Field | Type | Meaning / format |
|---|---|---|
| `ok` | boolean | `true` |
| `from`, `to` | string | `Account.getDisplayName()` |
| `amount` | string | `Money.format(amountCents)` → `$1,250.00` (negatives would render `-$1.00`) |
| `fee` | string | `No fee` when 0 else `$3.00` |
| `total` | string | amount + fee, same format |
| `type` | string | `xfrtype.<INT|EXS|EXN>` label |
| `tier` | string | `tier.<code>` label |
| `delivery` | string | `SimpleDateFormat("EEE, MMM d, yyyy")` of the delivery/post date (JVM default locale/zone, ET in `run.sh`) |

**Validation error response** (any `TransferValidationException`):

```json
{"ok":false,"message":"This transfer exceeds the per-transfer limit of $3,500.00 for your relationship tier."}
```

Strings are escaped with `StringEscapeUtils.escapeJavaScript`, which produces JSON-valid `\"`, `\\`, `\/` (`MM\/DD\/YYYY`) but **also `\'`** — see §6 for the consequence on the daily-limit message. Non-validation exceptions are not caught and return the HTML error page (AC-42).

---

## 4. HTTP routes

Servlet mapping `*.do` → Struts `ActionServlet` (`web.xml:L43-L55`); `AuthFilter` on `/secure/*` (`web.xml:L34-L41`). Welcome file `index.jsp`. Context root is `/` (deployed as `ROOT.war`, `run.sh:L10-L11`).

| Route | Method | Auth | Form bean / params | Success | Failure / other |
|---|---|---|---|---|---|
| `/index.jsp` (`/`) | GET | public | `?expired=1` shows session-expired box; reads `olb_uid` cookie | renders landing + sign-in form (POSTs to `/login.do`) | – |
| `/login.do` | POST (GET works too) | public | `loginForm` (request): `userId`, `password`, `saveUserId` | `302 → /secure/transfer.do`; sets `JSESSIONID` (new) and `olb_uid` | forward (200) to `/index.jsp` with `<html:errors/>`: required / invalid / locked |
| `/logout.do` | GET | public | – | `302 → /index.jsp`; session invalidated | – |
| `/secure/transfer.do` | GET | required | `transferForm` (session) | 200 `transfer.jsp` with `accounts`, `quote` (nullable), `recentTransfers` | unauth → `302 /index.jsp?expired=1` |
| `/secure/transferSubmit.do` | POST | required | `transferForm` (session): `fromAcctId`, `toAcctId`, `amount`, `tierCode`, `delivery`, `frequency`, `scheduledDate`, `memo` | `302 → /secure/transferConfirm.do`; session `olb.lastConfirmation` | validation → forward (200) `transfer.jsp` with error list; SQL error → `error.jsp` |
| `/secure/transferConfirm.do` | GET | required | `?conf=` optional, else session `olb.lastConfirmation` | 200 `confirm.jsp` with `transfer`, `accounts` | not found / not owned → `302 → /secure/transfer.do` |
| `/secure/quote.do` | POST (GET works) | required | `transferForm` (request) | 200 JSON `ok:true` | 200 JSON `ok:false`; unauth → `302 /index.jsp?expired=1` |
| `/css/olb.css`, `/js/*.js`, `/images/*` | GET | public | – | static | – |
| any other / exception | – | – | – | – | `error.jsp` (404 and `Throwable`), HTTP status preserved |

Global forwards (`struts-config.xml:L16-L19`): `login` → `/index.jsp` (redirect), `home` → `/secure/transfer.do` (redirect). Global exception handler (`L12-L14`) routes `java.lang.Exception` to `error.jsp`.

---

## 5. Complete list of user-visible strings used by the rules

From `messages:L10-L50` (verbatim, including punctuation):

| Key | Text |
|---|---|
| `error.login.required` | Please enter your User ID and Password. |
| `error.login.invalid` | The User ID or Password you entered does not match our records. Please try again. |
| `error.login.locked` | Your account is temporarily locked after too many unsuccessful sign-in attempts. Please call 800.432.1000. |
| `error.session.expired` | For your security, your session has ended due to inactivity. Please log in again. |
| `error.xfr.amount.required` | Please enter an amount. |
| `error.xfr.amount.invalid` | Please enter a valid dollar amount (for example, 250.00). |
| `error.xfr.amount.min` | The transfer amount must be at least $0.01. |
| `error.xfr.sameacct` | The From and To accounts must be different. |
| `error.xfr.acct.invalid` | Please select valid From and To accounts. |
| `error.xfr.nsf` | The amount plus any fee exceeds the available balance in your From account. |
| `error.xfr.pertxn` | This transfer exceeds the per-transfer limit of {0} for your relationship tier. |
| `error.xfr.daily` | This transfer would exceed your daily external transfer limit of {0}. Today''s external transfers total {1}. *(renders with the doubled apostrophe — see §6)* |
| `error.xfr.regd` | You have reached the limit of 6 transfers from your savings account this statement cycle (Regulation D). |
| `error.xfr.ext2ext` | Transfers between two external accounts are not supported. |
| `error.xfr.date.past` | The transfer date cannot be in the past. |
| `error.xfr.date.invalid` | Please enter the transfer date as MM/DD/YYYY. |
| `error.xfr.tier.invalid` | Please select a relationship tier. |
| `error.xfr.frequency.invalid` | Please select a frequency. |
| `error.xfr.tier.notowned` | The selected relationship tier is not on file for this customer. *(defined, never used)* |
| `tier.00/10/20/30` | Standard / Preferred Rewards Gold / Preferred Rewards Platinum / Preferred Rewards Platinum Honors |
| `xfrtype.INT/EXS/EXN` | Between your Bank of America accounts / 3 business days (no fee) / Next business day |
| `freq.O/W/M` | One time / Weekly / Monthly |
| `stat.P/S/R` | Posted / Scheduled / Rejected |
| `xfr.confirm.heading` | Your transfer has been submitted |
| `xfr.confirm.sameday` | Transfers between your Bank of America accounts post the same day. |
| `xfr.confirm.external` | External transfers are sent via ACH and will arrive on the delivery date shown. |

Hard-coded in JSPs: "Confirmation number:", "Updated balances", "Make another transfer", "Print", "Submitted … via Online Banking.", "We're sorry, Online Banking is temporarily unavailable.", "Please try again in a few minutes. If you continue to see this message, call us at 800.432.1000.", "Return to sign in", "Available", "(closed account)" (`TransferDAO:L173`).

---

## 6. Ambiguities / quirks preserved (what the code actually does)

1. **Doubled apostrophe in the daily-limit message.** `error.xfr.daily` is written `Today''s` (MessageFormat escaping), but Struts `MessageResources` has `escape=true` by default and doubles single quotes *again* before formatting, so the user sees **`Today''s`** literally — verified in both the HTML error list and the JSON. In the JSON it is additionally escaped as `Today\'\'s`; `\'` is not a legal JSON escape, so `JSON.parse` in any modern browser throws and jQuery's `error` callback runs (status 200 ⇒ no redirect, nothing displayed). Net effect: **the daily-limit error never appears in the live summary, only after clicking "Transfer now".** The modern build should show the message with a single apostrophe and valid JSON; record the deviation.
2. **Tier is a user-selectable input.** The server trusts the submitted `tierCode` for pricing/limits and persists it on the transfer; the stored customer tier is only a default (AC-20). `error.xfr.tier.notowned` is dead text.
3. **Internal per-transaction cap is hard-coded** at $99,999.99 (`INTERNAL_PER_TXN_CAP_CENTS`); the INT rows' `PER_TXN_LIM_CENTS`/`DAILY_LIM_CENTS` in `OLB_FEE_SCHED` are never read, and there is no daily limit for INT.
4. **Daily external limit only applies to same-day requests** and counts inbound (EXT→internal) amounts too; fees are excluded from the sum; the limit is per customer across all accounts. Future-dating an external transfer bypasses the daily cap entirely (AC-28).
5. **Reg D uses the calendar month of the *scheduled* date**, not a statement cycle and not "today"; it counts INT and external outbound rows alike (posted or scheduled). The message says "statement cycle".
6. **Type comment vs. code.** The class comment says type is "derived from the TO account"; the code treats *either* side being external as external (inbound from Chase is `EXS`/`EXN` too), with no balance effect for inbound.
7. **Any unrecognised `delivery` value silently means `EXS`.**
8. **Fee rows are not date-versioned despite `EFF_DT`.** PK is `(type, tier)`, so at most one row exists; `EFF_DT <= CURRENT_DATE` just hides a future-dated row (→ "Please select a relationship tier."). `CURRENT_DATE` is evaluated by HSQLDB in the JVM default zone, while everything else uses explicit `America/New_York`.
9. **Cutoff only for same-day requests**; a future-dated external transfer is never pushed by the 8 PM rule, only by weekend/holiday roll-forward. INT ignores cutoff, weekends and holidays entirely (a Saturday INT "delivers" Saturday).
10. **Confirmation sequence uses today's ET date**, not the scheduled date, and `OLB_CONF_SEQ` starts empty each boot — numbers restart at `000001` after restart even though history shows higher sequences.
11. **Frequency `W`/`M` is cosmetic** — stored and displayed but no recurring transfers are created.
12. **Future-dated transfers never execute** in this app (no batch), and nothing writes `STAT_CD='R'`.
13. **"Session expired" banner for never-logged-in users** — any anonymous hit on `/secure/*` says the session ended due to inactivity.
14. **AuthFilter cache headers are overwritten** by Struts' `nocache` headers (`Cache-Control: no-cache,no-store,max-age=0`, `Pragma: No-cache`, `Expires: 1970`); intent is identical.
15. **`olb.js` AJAX "redirect on 302/0" never fires** — browsers follow the 302 transparently and the HTML response arrives as a status-200 parse error; an expired session during live editing therefore fails silently until the next full navigation.
16. **Login failure keeps the URL at `/login.do`** (forward), so a browser refresh re-POSTs the credentials (and counts another failure).
17. **Lockout is permanent in-app** and the 3rd failure already shows the locked message (not the invalid one). Case-insensitive user ID, case-sensitive password, password not trimmed.
18. **Negative amounts parse** (`-5` → −500¢) and are rejected by the "at least $0.01" rule rather than the "valid dollar amount" rule; `.50` is rejected as invalid; `1250.` is accepted; up to 13 integer digits accepted.
19. **Money formatting** is `Locale.US` currency (`$1,250.00`); negatives are rewritten from `($1.00)` to `-$1.00` (only reachable for display of negative balances, which the rules prevent).
20. **Timezone.** All business dates are computed in `America/New_York` via `GregorianCalendar(EASTERN)`; `java.sql.Date.valueOf` and the HSQLDB `CURRENT_DATE` depend on the JVM default zone, which `run.sh` pins to `America/New_York` (`run.sh:L13`, `-Duser.timezone`). The modern system should treat business dates as `DATE` in `America/New_York`.
21. **Seed inconsistency.** `README.md:L46` calls the demo customer "Jordan Reyes"; `seed.sql` has **Jordan Rivera** (seed wins; the header shows "Welcome, Jordan").
22. **"Available" line only when it differs from current** — after same-day INT the two balances stay equal so no line appears; after an external hold the line appears (AC-36).
23. **Account labels in history come from a join without a status filter**, so a closed account still shows its name in history; only a *deleted* account row yields "(closed account)".
