# 03 — Data & platform analysis: legacy OLB-XFR → bofa-modernized

**Legacy source of truth:** [jennamansueto/bofa-portal](https://github.com/jennamansueto/bofa-portal) @ `main` (commit `a40f2b8`).
**Target:** [jennamansueto/bofa-modernized](https://github.com/jennamansueto/bofa-modernized) — Java 21 / Spring Boot 3 / PostgreSQL 16 / React 18 + TypeScript + Vite / Playwright.
**Scope of this document:** schema, seed data, identifier generation, EOL/CVE inventory, security debt, and the local run/test platform. Business rules (R1–R10) are specified in `docs/01-acceptance-criteria.md`; the UI in `docs/02-ui-spec.md`. This document only describes rules where they constrain the data model.

Every statement below cites the legacy file and line range it was read from (paths relative to the bofa-portal repo root). Facts marked **[verified live]** were confirmed by running the legacy app on Tomcat 7.0.109 / OpenJDK 8 on Fri 2026-10-09 (`JAVA_HOME=/usr/lib/jvm/java-8-openjdk-amd64 ./run.sh`) and driving `login.do`, `secure/quote.do`, `secure/transferSubmit.do` with `curl`; HSQLDB-specific facts were confirmed by loading `schema.sql` + `seed.sql` into HSQLDB 1.8.0.10 directly.

---

## 1. How the legacy app talks to its database

| Aspect | Legacy behaviour | Source |
|---|---|---|
| Engine | HSQLDB 1.8.0.10 **in-memory** (`jdbc:hsqldb:mem:olbp01`, user `sa`, empty password) standing in for DB2 for z/OS schema `OLBP01`. Database is recreated from scratch on every Tomcat start; nothing persists across restarts. | `src/main/webapp/WEB-INF/web.xml:9-24`; `src/main/resources/sql/schema.sql:1-5`; `pom.xml:62-67` |
| Bootstrap | `StartupListener.contextInitialized` initialises the pool, then executes `sql/schema.sql` and `sql/seed.sql` statement-by-statement (split on trailing `;`, `--` comment lines skipped, read as ISO-8859-1). Failure aborts deployment. | `src/main/java/com/bankofamerica/olb/web/StartupListener.java:27-44, 60-86` |
| Pool | Commons DBCP 1.4 `BasicDataSource`, `maxActive=8`, `maxIdle=4`, `defaultAutoCommit=true`. | `src/main/java/com/bankofamerica/olb/dao/ConnectionFactory.java:23-35` |
| Transactions | Only `TransferService.submit` opens a transaction (`setAutoCommit(false)` … `commit()` / `rollback()`); everything else is auto-commit single statements. Quotes run on a separate auto-commit connection. | `src/main/java/com/bankofamerica/olb/service/TransferService.java:76-133, 62-74` |
| Shutdown | `SHUTDOWN` statement then pool close on context destroy. | `StartupListener.java:46-58` |
| Config | JDBC URL/driver/user/password and the posting cutoff hour (`olb.cutoff.hour=20`) are `<context-param>`s in `web.xml`. | `web.xml:9-28`; `StartupListener.java:41-43` |
| Timezone | Tomcat is started with `-Duser.timezone=America/New_York`; all `java.sql.Date`/`Timestamp` values and HSQLDB `CURRENT_DATE` are therefore ET wall-clock values. | `run.sh:13`; verified: HSQLDB `CURRENT_DATE` = `2026-10-09` while UTC host clock was 12:42 |
| Access pattern | Hand-written JDBC DAOs with `PreparedStatement`s (no ORM). All SQL is parameterised — no string-concatenated user input. | `dao/AccountDAO.java`, `dao/CustomerDAO.java`, `dao/TransferDAO.java`, `dao/FeeScheduleDAO.java` |

---

## 2. Legacy schema walkthrough

`schema.sql:1-5` states the conventions: DB2-style names per "corporate data dictionary std 2.3", and **all money columns are `BIGINT` cents** mirroring host `COMP-3 S9(13)V99` packed-decimal fields. Six tables, no foreign keys, one unique index.

### 2.1 `OLB_CUST` — online-banking customer / login (`schema.sql:7-18`)

| Column | Type | Meaning | Read by | Written by |
|---|---|---|---|---|
| `CUST_ID` | `INTEGER NOT NULL PK` | Customer number (host key). Held in the HTTP session inside `Customer`. | `CustomerDAO.java:14-26`; `AccountDAO.java:22-23`; `TransferDAO.java:59-60, 76-78, 93-95` | seed only |
| `OLB_USER_ID` | `VARCHAR(32) NOT NULL`, unique index `OLB_CUST_UX1` | Sign-in user ID. Lookup is **case-insensitive** (`UPPER(OLB_USER_ID) = UPPER(?)`). The stored casing is what goes into the `olb_uid` cookie. | `CustomerDAO.java:13-15, 27`; `LoginAction.java:53` | seed only |
| `PSWD_HASH` | `CHAR(32) NOT NULL` | Lower-case hex **unsalted MD5** of the UTF-8 password. Compared with `equalsIgnoreCase`. | `CustomerDAO.java:34`; `AuthService.java:28, 37-53` | seed only (no change-password function) |
| `FIRST_NM`, `LAST_NM` | `VARCHAR(40) NOT NULL` | Display name ("Welcome, Jordan"). | `CustomerDAO.java:28-29`; `jsp/inc/olbHeader.jspf:18` | seed only |
| `REL_TIER_CD` | `CHAR(2) DEFAULT '00' NOT NULL` | Preferred Rewards tier on file: `00` none/Standard, `10` Gold, `20` Platinum, `30` Platinum Honors. Only used as the **default** for the tier dropdown; the customer may pick any tier on the form (see §2.3 `REL_TIER_CD` quirk). | `CustomerDAO.java:30`; `TransferViewAction.java:42`; `service/FeeSchedule.java:10-20` | seed only |
| `LAST_LOGIN_TS` | `TIMESTAMP` (nullable) | Set to "now" on successful sign-in. Never displayed. | `CustomerDAO.java:31` | `CustomerDAO.java:47-50` |
| `FAIL_CNT` | `SMALLINT DEFAULT 0 NOT NULL` | Consecutive failed sign-ins. Reset to 0 on success; incremented on failure. | `CustomerDAO.java:32`; `AuthService.java:30` | `CustomerDAO.java:48, 53-55` |
| `STAT_CD` | `CHAR(1) DEFAULT 'A' NOT NULL` | `A` active, `L` locked. Set to `L` in the same `UPDATE` when `FAIL_CNT + 1 >= 3`. No unlock path in the app ("Unlock is a CICS OLBM02 function"). | `CustomerDAO.java:33`; `AuthService.java:27` | `CustomerDAO.java:52-54` |

Lockout semantics **[verified live]**: attempts 1 and 2 with a wrong password return "does not match our records"; attempt 3 returns "temporarily locked" and sets `STAT_CD='L'`; every later attempt — including the correct password — returns "temporarily locked" (`AuthService.java:27-31`). Unknown user IDs return "does not match" and nothing is written (`AuthService.java:26`).

### 2.2 `OLB_ACCT` — deposit and linked external accounts (`schema.sql:20-31`)

| Column | Type | Meaning | Read by | Written by |
|---|---|---|---|---|
| `ACCT_ID` | `VARCHAR(12) NOT NULL PK` | Surrogate id shown on screen (`ACCT-1001`). Also the `<option value>` in both account dropdowns, so it is **client-supplied** on quote/submit. | `AccountDAO.java:14-15, 37-38`; `transfer.jsp:81, 87` | seed only |
| `CUST_ID` | `INTEGER NOT NULL` | Owner. Ownership check: both FROM and TO must belong to the session customer. | `AccountDAO.java:22`; `TransferService.java:149` | seed only |
| `ACCT_TYP_CD` | `CHAR(3) NOT NULL` | `DDA` checking, `SAV` savings, `EXT` external (other bank). Drives transfer type (R3), Reg D (R7) and hold logic (R9). | `model/Account.java:10-12, 43-44`; `TransferService.java:152, 166-170, 194, 357` | seed only |
| `PROD_NM` | `VARCHAR(60) NOT NULL` | Product name ("Advantage Plus Banking - Checking"). | `AccountDAO.java:64`; `Account.java:47-54`; `TransferDAO.java:18-19, 167-175` | seed only |
| `ACCT_NBR_LAST4` | `CHAR(4) NOT NULL` | Last four of the real account number, rendered as `...1001`. | `AccountDAO.java:65`; `Account.java:52` | seed only |
| `CUR_BAL_CENTS` | `BIGINT DEFAULT 0 NOT NULL` | Ledger (current) balance in cents. Shown as the big balance figure. | `AccountDAO.java:66`; `transfer.jsp:50` | `AccountDAO.java:46-57` (`+= delta`) |
| `AVL_BAL_CENTS` | `BIGINT DEFAULT 0 NOT NULL` | Available balance in cents. Used for the NSF check (R5). Shown only when it differs from current. | `AccountDAO.java:67`; `TransferService.java:190`; `transfer.jsp:53` | `AccountDAO.java:46-57` |
| `EXT_BANK_NM` | `VARCHAR(60)` nullable | Other bank's name for `EXT` rows; prefixed to the display label ("JPMorgan Chase Bank, N.A. - Chase Total Checking ...4432"). | `AccountDAO.java:68`; `Account.java:49-51`; `TransferDAO.java:172-175` | seed only |
| `SEQ_NO` | `SMALLINT DEFAULT 0 NOT NULL` | Display order within the customer (`ORDER BY SEQ_NO`). Also decides form defaults: first non-external = From, second = To. | `AccountDAO.java:22`; `TransferViewAction.java:30-41` | seed only |
| `STAT_CD` | `CHAR(1) DEFAULT 'A' NOT NULL` | `A` active; anything else is "closed": excluded from lists and from `findById`, and rendered as `(closed account)` in history. Never written by the app. | `AccountDAO.java:22, 37`; `TransferDAO.java:21-22, 172-173` | — |

Balance movements (`TransferService.java:102-117`) **[verified live]**:
* `INT` scheduled for today: FROM `CUR` and `AVL` −= amount + fee; TO `CUR` and `AVL` += amount; status `P`. ($100 checking→savings left `$4,115.38` / `$13,040.00`.)
* `EXS`/`EXN` from an internal account: FROM `AVL` −= amount + fee only (`CUR` unchanged); status `S`. ($500 + $3.00 fee left current `$4,115.38`, available `$3,612.38`.)
* `EXS`/`EXN` *from* the external account (inbound ACH) and future-dated `INT`: no balance change; status `S`.
* The TO side of an external transfer is never credited (`ACCT-1003` stays at 0).

### 2.3 `OLB_XFR` — transfer history (`schema.sql:33-50`)

| Column | Type | Meaning | Read by | Written by |
|---|---|---|---|---|
| `XFR_ID` | `INTEGER IDENTITY` | Surrogate key. Only used as the secondary sort key for history. HSQLDB 1.8 `IDENTITY` **starts at 0**, so the three seeded rows get ids 0, 1, 2 (verified). Retrieved after insert via `CALL IDENTITY()`. | `TransferDAO.java:76, 152` | `TransferDAO.java:47-49` |
| `CONF_NBR` | `CHAR(16) NOT NULL` | Confirmation number `XFRyyMMdd-nnnnnn` (exactly 16 chars). Lookup key for the confirmation page, scoped by `CUST_ID`. **No unique constraint.** | `TransferDAO.java:59-61`; `TransferConfirmAction.java:20-22` | `TransferService.java:100, 237-244` |
| `CUST_ID` | `INTEGER NOT NULL` | Owner. All history queries filter on it. | `TransferDAO.java:59, 76, 93` | `TransferService.java:88` |
| `FROM_ACCT_ID`, `TO_ACCT_ID` | `VARCHAR(12) NOT NULL` | Account ids; `LEFT JOIN`ed to `OLB_ACCT` for labels. | `TransferDAO.java:20-22, 109` | `TransferService.java:89-90` |
| `AMT_CENTS` | `BIGINT NOT NULL` | Amount in cents (> 0). | `TransferDAO.java:93, 157` | `TransferService.java:91` |
| `FEE_CENTS` | `BIGINT DEFAULT 0 NOT NULL` | Fee in cents from `OLB_FEE_SCHED` at submit time. | `TransferDAO.java:158`; `transfer.jsp:66` | `TransferService.java:92` |
| `XFR_TYP_CD` | `CHAR(3) NOT NULL` | `INT` internal, `EXS` external standard (3 business days), `EXN` external next business day. | `TransferDAO.java:94, 159`; `model/Transfer.java:105-107` | `TransferService.java:93` |
| `REL_TIER_CD` | `CHAR(2) NOT NULL` | Tier **selected on the form** when the transfer was priced — not necessarily the customer's tier on file (`error.xfr.tier.notowned` exists in the resource bundle but is never thrown). Shown on the confirmation page. | `TransferDAO.java:160`; `confirm.jsp:175` | `TransferService.java:94, 216` |
| `FREQ_CD` | `CHAR(1) DEFAULT 'O' NOT NULL` | `O` one time, `W` weekly, `M` monthly. Validated and stored; **no recurrence engine exists** — a `W`/`M` transfer is persisted as a single row. | `TransferDAO.java:161`; `confirm.jsp:176` | `TransferService.java:95, 155-157` |
| `SCHED_DT` | `DATE NOT NULL` | Requested send date (ET calendar date; defaults to today). Drives the daily external limit sum and Reg D month count. | `TransferDAO.java:93-94, 109-110, 162` | `TransferService.java:96` |
| `POST_DT` | `DATE NOT NULL` | Posting date for `INT` (= `SCHED_DT`) or ACH delivery date for `EXS`/`EXN`. | `TransferDAO.java:163`; `transfer.jsp:65`; `confirm.jsp:178` | `TransferService.java:97` |
| `STAT_CD` | `CHAR(1) NOT NULL` | `P` posted, `S` scheduled, `R` rejected. The app only ever writes `P` or `S`; `R` is excluded from limit sums and only arrives from host batch. | `TransferDAO.java:94, 109, 164` | `TransferService.java:105, 109` |
| `MEMO` | `VARCHAR(60)` nullable | Trimmed memo; empty → `NULL`. HTML-escaped on output. | `TransferDAO.java:165`; `confirm.jsp:179` | `TransferService.java:98` |
| `CRT_TS` | `TIMESTAMP NOT NULL` | Submission wall-clock time (ET, see §1). History is `ORDER BY CRT_TS DESC, XFR_ID DESC`, max 10 rows. | `TransferDAO.java:76-77, 166`; `confirm.jsp:8-9, 44` | `TransferService.java:99` |
| `CRT_CHNL_CD` | `CHAR(3) DEFAULT 'OLB' NOT NULL` | Channel. Never read or written by the app (always default `OLB`). | — | — |

### 2.4 `OLB_FEE_SCHED` — fee / limit matrix (`schema.sql:52-61`)

| Column | Type | Meaning | Read by |
|---|---|---|---|
| `XFR_TYP_CD` | `CHAR(3) NOT NULL` (PK part) | Transfer type `INT`/`EXS`/`EXN`. | `FeeScheduleDAO.java:82-84` |
| `REL_TIER_CD` | `CHAR(2) NOT NULL` (PK part) | Tier `00`/`10`/`20`/`30`. | `FeeScheduleDAO.java:82-85` |
| `FEE_CENTS` | `BIGINT NOT NULL` | Fee per transfer, **in cents** (`300` = $3.00). | `FeeScheduleDAO.java:88`; `TransferService.java:190, 213` |
| `DAILY_LIM_CENTS` | `BIGINT NOT NULL` | Daily cap on the customer's **external** transfers scheduled for today (sum of today's non-rejected `EXS`+`EXN` + this one), in cents. **Ignored for `INT`.** | `FeeScheduleDAO.java:88`; `TransferService.java:182-188` |
| `PER_TXN_LIM_CENTS` | `BIGINT NOT NULL` | Per-transfer cap in cents. **Ignored for `INT`**, which uses the hard-coded `INTERNAL_PER_TXN_CAP_CENTS = 9_999_999` ($99,999.99 — numerically equal to the seeded `INT` rows). | `FeeScheduleDAO.java:88`; `TransferService.java:46, 177-180` |
| `EFF_DT` | `DATE NOT NULL` | Effective date; lookup requires `EFF_DT <= CURRENT_DATE` (DB clock, i.e. JVM timezone). Because the PK is `(type, tier)` there can only be **one row per cell — no rate history**, and the query has no `ORDER BY`. | `FeeScheduleDAO.java:83` |

No row for a `(type, tier)` → `error.xfr.tier.invalid` (`TransferService.java:173-174`).

### 2.5 `OLB_BANK_HOL` — bank holidays (`schema.sql:63-66`)

| Column | Type | Meaning | Read by |
|---|---|---|---|
| `HOL_DT` | `DATE NOT NULL PK` | Non-business date. Loaded as a `Set<String>` of `yyyy-MM-dd` once per request/quote; Saturdays and Sundays are non-business days without being in the table. | `FeeScheduleDAO.java:94-108`; `BusinessCalendar.java:39-45` |
| `HOL_NM` | `VARCHAR(40) NOT NULL` | Name — never read by the app. | — |

### 2.6 `OLB_CONF_SEQ` — daily confirmation counter (`schema.sql:68-71`)

| Column | Type | Meaning | Read/written by |
|---|---|---|---|
| `SEQ_DT` | `DATE NOT NULL PK` | ET business date the counter is for. | `TransferDAO.java:123-148` |
| `LAST_SEQ` | `INTEGER NOT NULL` | Last issued sequence number for that date. **Not seeded** — the first transfer of a day always gets `000001`. | `TransferDAO.java:123-148` |

### 2.7 Code lists (preserved verbatim in the target)

| Domain | Codes | Labels (`ApplicationResources.properties`) | Source |
|---|---|---|---|
| Account type `ACCT_TYP_CD` | `DDA`, `SAV`, `EXT` | — | `model/Account.java:10-12` |
| Transfer type `XFR_TYP_CD` | `INT`, `EXS`, `EXN` | "Between your Bank of America accounts" / "3 business days (no fee)" / "Next business day" | `model/Transfer.java:105-107`; `ApplicationResources.properties:36-38` |
| Relationship tier `REL_TIER_CD` | `00`, `10`, `20`, `30` | Standard / Preferred Rewards Gold / Preferred Rewards Platinum / Preferred Rewards Platinum Honors | `service/FeeSchedule.java:10-15`; `ApplicationResources.properties:31-34` |
| Frequency `FREQ_CD` | `O`, `W`, `M` | One time / Weekly / Monthly | `TransferService.java:155`; `ApplicationResources.properties:40-42` |
| Transfer status `STAT_CD` | `P`, `S`, `R` | Posted / Scheduled / Rejected | `model/Transfer.java:109-111`; `ApplicationResources.properties:44-46` |
| Customer status `STAT_CD` | `A`, `L` | — | `CustomerDAO.java:52-54`; `AuthService.java:27` |
| Account status `STAT_CD` | `A` (+ anything else = closed) | — | `AccountDAO.java:22, 37` |
| Channel `CRT_CHNL_CD` | `OLB` | — | `schema.sql:49` |

---

## 3. Money representation decision: `BIGINT` integer cents

**Decision: keep money as integer cents (`BIGINT`) in PostgreSQL and `long` in Java; expose decimal strings at the API boundary.** The org default (`NUMERIC(15,2)`) is overridden because the legacy analysis gives concrete reasons:

| Evidence | Source |
|---|---|
| Every money column is `BIGINT` cents by stated design (host `COMP-3 S9(13)V99`). | `schema.sql:4, 26-27, 39-40, 56-58` |
| All DAO reads/writes use `getLong`/`setLong`; balance updates are integer deltas `CUR_BAL_CENTS = CUR_BAL_CENTS + ?`. | `AccountDAO.java:46-57, 66-67`; `TransferDAO.java:36-45, 157-158` |
| Fee, total and limit arithmetic is pure `long` addition/comparison: `amountCents + feeCents`, `todaysExternal + amount > dailyLimit`. No multiplication, no percentages, no rounding anywhere in the domain. | `TransferQuote.java:38`; `Transfer.java:168-170`; `TransferService.java:176-191` |
| Input parsing is exact: regex `-?\d{1,13}(\.\d{0,2})?` then `BigDecimal.setScale(2, RoundingMode.UNNECESSARY).movePointRight(2).longValueExact()`; more than 2 decimals or > 13 integer digits is rejected, never rounded. **[verified live]** `1.234` → "Please enter a valid dollar amount". | `util/Money.java:35-50` |
| Output formatting is `new BigDecimal(cents).movePointLeft(2)` fed to `NumberFormat.getCurrencyInstance(Locale.US)` / `DecimalFormat("0.00")` — a pure scale shift, no rounding. | `util/Money.java:18-33` |
| Limits are also cents, with the sentinel `99999999`/`9999999` for internal transfers. | `seed.sql:16-19`; `TransferService.java:46` |

Consequences for the target:
* **Fidelity:** exact replication of every legacy computation and limit edge (e.g. `$3,500.00` passes, `$3,500.01` fails — `>` compare at `TransferService.java:177, 184`) without any float/scale pitfalls.
* **Java:** domain and persistence use `long` (JPA `@Column(columnDefinition="bigint")` → Java `long`); a small `Money` value object wraps parse/format, porting `Money.java` 1:1. `BigDecimal` is used only at the boundary to parse/print.
* **JSON:** serialise amounts as **decimal strings** (`"amount": "500.00"`) — never as JS numbers (53-bit precision is fine, but strings avoid `3.00` → `3` normalisation and make the contract explicit). Also carry `amountCents` as an integer where the UI needs arithmetic. Accept input as a string and validate with the same regex as legacy.
* **SQL analytics:** `SUM(amt_cents)` stays exact; views can expose `amt_cents / 100.0` if humans need dollars.
* **Range:** `BIGINT` (±9.2e18 cents) comfortably exceeds the host's 13+2 digit field (max 99,999,999,999.99 → 9,999,999,999,999 cents).

Rejected alternative `NUMERIC(15,2)`: would need `setScale`/rounding discipline in every arithmetic path, a `BigDecimal` domain type, and still has to be converted to/from cents for the fee schedule and limit comparisons; it buys readability in ad-hoc SQL only, which the `_dollars` views below provide.

---

## 4. Target PostgreSQL 16 schema (Flyway `V1__schema.sql`)

Naming: `snake_case`, singular-ish table names prefixed `olb_` to keep the lineage obvious, legacy column names expanded (`CUST_ID` → `customer_id`, `*_CENTS` kept as `*_cents`). Legacy codes (`INT/EXS/EXN`, `DDA/SAV/EXT`, `00/10/20/30`, `O/W/M`, `P/S/R`, `A/L`) are preserved as `CHAR(n)` with `CHECK` constraints — no renaming, so no mapping table is needed. The column mapping is given in §4.2.

```sql
-- V1__schema.sql  (PostgreSQL 16)
-- Legacy source: bofa-portal src/main/resources/sql/schema.sql (HSQLDB 1.8 / DB2 OLBP01)

CREATE TABLE olb_customer (
    customer_id        INTEGER      NOT NULL,
    user_id            VARCHAR(32)  NOT NULL,
    password_hash      VARCHAR(72)  NOT NULL,                 -- bcrypt "$2a$12$..." (60 chars); was CHAR(32) MD5
    first_name         VARCHAR(40)  NOT NULL,
    last_name          VARCHAR(40)  NOT NULL,
    rel_tier_cd        CHAR(2)      NOT NULL DEFAULT '00',
    last_login_ts      TIMESTAMPTZ,
    fail_cnt           SMALLINT     NOT NULL DEFAULT 0,
    stat_cd            CHAR(1)      NOT NULL DEFAULT 'A',
    CONSTRAINT pk_olb_customer           PRIMARY KEY (customer_id),
    CONSTRAINT ck_olb_customer_tier      CHECK (rel_tier_cd IN ('00','10','20','30')),
    CONSTRAINT ck_olb_customer_stat      CHECK (stat_cd IN ('A','L')),
    CONSTRAINT ck_olb_customer_fail_cnt  CHECK (fail_cnt >= 0)
);
-- legacy lookup is UPPER(OLB_USER_ID) = UPPER(?)  (CustomerDAO.java:13-15)
CREATE UNIQUE INDEX ux_olb_customer_user_id_ci ON olb_customer (UPPER(user_id));

CREATE TABLE olb_account (
    account_id         VARCHAR(12)  NOT NULL,
    customer_id        INTEGER      NOT NULL,
    acct_typ_cd        CHAR(3)      NOT NULL,
    product_name       VARCHAR(60)  NOT NULL,
    acct_nbr_last4     CHAR(4)      NOT NULL,
    cur_bal_cents      BIGINT       NOT NULL DEFAULT 0,
    avl_bal_cents      BIGINT       NOT NULL DEFAULT 0,
    ext_bank_name      VARCHAR(60),
    seq_no             SMALLINT     NOT NULL DEFAULT 0,
    stat_cd            CHAR(1)      NOT NULL DEFAULT 'A',
    CONSTRAINT pk_olb_account            PRIMARY KEY (account_id),
    CONSTRAINT fk_olb_account_customer   FOREIGN KEY (customer_id) REFERENCES olb_customer (customer_id),
    CONSTRAINT ck_olb_account_type       CHECK (acct_typ_cd IN ('DDA','SAV','EXT')),
    CONSTRAINT ck_olb_account_stat       CHECK (stat_cd IN ('A','C')),       -- 'C' closed: legacy treats any non-'A' as closed (AccountDAO.java:22,37)
    CONSTRAINT ck_olb_account_last4      CHECK (acct_nbr_last4 ~ '^[0-9]{4}$'),
    CONSTRAINT ck_olb_account_ext_bank   CHECK ((acct_typ_cd = 'EXT') = (ext_bank_name IS NOT NULL))
);
CREATE INDEX ix_olb_account_customer_seq ON olb_account (customer_id, seq_no);

CREATE TABLE olb_fee_schedule (
    xfr_typ_cd         CHAR(3)      NOT NULL,
    rel_tier_cd        CHAR(2)      NOT NULL,
    fee_cents          BIGINT       NOT NULL,
    daily_lim_cents    BIGINT       NOT NULL,
    per_txn_lim_cents  BIGINT       NOT NULL,
    eff_dt             DATE         NOT NULL,
    CONSTRAINT pk_olb_fee_schedule       PRIMARY KEY (xfr_typ_cd, rel_tier_cd),   -- same grain as legacy: one row per cell, no rate history
    CONSTRAINT ck_olb_fee_schedule_type  CHECK (xfr_typ_cd IN ('INT','EXS','EXN')),
    CONSTRAINT ck_olb_fee_schedule_tier  CHECK (rel_tier_cd IN ('00','10','20','30')),
    CONSTRAINT ck_olb_fee_schedule_nonneg CHECK (fee_cents >= 0 AND daily_lim_cents >= 0 AND per_txn_lim_cents >= 0)
);

CREATE TABLE olb_bank_holiday (
    holiday_dt         DATE         NOT NULL,
    holiday_name       VARCHAR(40)  NOT NULL,
    CONSTRAINT pk_olb_bank_holiday       PRIMARY KEY (holiday_dt)
);

CREATE TABLE olb_confirmation_seq (
    seq_dt             DATE         NOT NULL,
    last_seq           INTEGER      NOT NULL,
    CONSTRAINT pk_olb_confirmation_seq   PRIMARY KEY (seq_dt),
    CONSTRAINT ck_olb_confirmation_seq_range CHECK (last_seq BETWEEN 0 AND 999999)   -- 6-digit suffix (TransferService.java:241-242)
);

CREATE TABLE olb_transfer (
    transfer_id        BIGINT       GENERATED BY DEFAULT AS IDENTITY,
    conf_nbr           CHAR(16)     NOT NULL,
    customer_id        INTEGER      NOT NULL,
    from_account_id    VARCHAR(12)  NOT NULL,
    to_account_id      VARCHAR(12)  NOT NULL,
    amt_cents          BIGINT       NOT NULL,
    fee_cents          BIGINT       NOT NULL DEFAULT 0,
    xfr_typ_cd         CHAR(3)      NOT NULL,
    rel_tier_cd        CHAR(2)      NOT NULL,
    freq_cd            CHAR(1)      NOT NULL DEFAULT 'O',
    sched_dt           DATE         NOT NULL,
    post_dt            DATE         NOT NULL,
    stat_cd            CHAR(1)      NOT NULL,
    memo               VARCHAR(60),
    crt_ts             TIMESTAMPTZ  NOT NULL DEFAULT now(),
    crt_chnl_cd        CHAR(3)      NOT NULL DEFAULT 'OLB',
    CONSTRAINT pk_olb_transfer           PRIMARY KEY (transfer_id),
    CONSTRAINT ux_olb_transfer_conf_nbr  UNIQUE (conf_nbr),                      -- legacy had NO uniqueness; added deliberately
    CONSTRAINT fk_olb_transfer_customer  FOREIGN KEY (customer_id)     REFERENCES olb_customer (customer_id),
    CONSTRAINT fk_olb_transfer_from      FOREIGN KEY (from_account_id) REFERENCES olb_account (account_id),
    CONSTRAINT fk_olb_transfer_to        FOREIGN KEY (to_account_id)   REFERENCES olb_account (account_id),
    CONSTRAINT ck_olb_transfer_amt       CHECK (amt_cents > 0),                  -- R1 (TransferService.java:138-143)
    CONSTRAINT ck_olb_transfer_fee       CHECK (fee_cents >= 0),
    CONSTRAINT ck_olb_transfer_accts     CHECK (from_account_id <> to_account_id),-- R2 (TransferService.java:147)
    CONSTRAINT ck_olb_transfer_type      CHECK (xfr_typ_cd IN ('INT','EXS','EXN')),
    CONSTRAINT ck_olb_transfer_tier      CHECK (rel_tier_cd IN ('00','10','20','30')),
    CONSTRAINT ck_olb_transfer_freq      CHECK (freq_cd IN ('O','W','M')),
    CONSTRAINT ck_olb_transfer_stat      CHECK (stat_cd IN ('P','S','R')),
    CONSTRAINT ck_olb_transfer_conf_fmt  CHECK (conf_nbr ~ '^XFR[0-9]{6}-[0-9]{6}$'),
    CONSTRAINT ck_olb_transfer_post_dt   CHECK (post_dt >= sched_dt)
);
-- history: WHERE customer_id=? ORDER BY crt_ts DESC, transfer_id DESC LIMIT 10   (TransferDAO.java:74-78)
CREATE INDEX ix_olb_transfer_customer_crt ON olb_transfer (customer_id, crt_ts DESC, transfer_id DESC);
-- daily external limit sum: WHERE customer_id=? AND sched_dt=? AND xfr_typ_cd IN ('EXS','EXN') AND stat_cd<>'R'   (TransferDAO.java:89-103)
CREATE INDEX ix_olb_transfer_customer_sched ON olb_transfer (customer_id, sched_dt) INCLUDE (xfr_typ_cd, stat_cd, amt_cents);
-- Reg D count: WHERE from_account_id=? AND sched_dt BETWEEN ? AND ? AND stat_cd<>'R'   (TransferDAO.java:105-119)
CREATE INDEX ix_olb_transfer_from_sched ON olb_transfer (from_account_id, sched_dt) WHERE stat_cd <> 'R';

-- Convenience views for humans / BI (domain code never uses them)
CREATE VIEW v_olb_account_dollars AS
  SELECT account_id, customer_id, acct_typ_cd, product_name, acct_nbr_last4,
         cur_bal_cents / 100.0 AS current_balance, avl_bal_cents / 100.0 AS available_balance, ext_bank_name, seq_no, stat_cd
  FROM olb_account;
CREATE VIEW v_olb_transfer_dollars AS
  SELECT transfer_id, conf_nbr, customer_id, from_account_id, to_account_id,
         amt_cents / 100.0 AS amount, fee_cents / 100.0 AS fee, (amt_cents + fee_cents) / 100.0 AS total_debit,
         xfr_typ_cd, rel_tier_cd, freq_cd, sched_dt, post_dt, stat_cd, memo, crt_ts, crt_chnl_cd
  FROM olb_transfer;
```

### 4.1 Deliberate deviations from the legacy schema (and why)

| Change | Reason |
|---|---|
| `password_hash VARCHAR(72)` instead of `CHAR(32)` | bcrypt output is 60 chars (`$2a$12$` + 22-char salt + 31-char hash). Security item, see §8.1. |
| `TIMESTAMPTZ` for `last_login_ts` / `crt_ts` | Legacy `TIMESTAMP` was implicitly ET because of `-Duser.timezone` (`run.sh:13`). Storing instants and rendering in `America/New_York` is the only way to survive UTC containers (§9.3). `DATE` columns (`sched_dt`, `post_dt`, `eff_dt`, `holiday_dt`, `seq_dt`) stay `DATE`: they are ET business dates, not instants. |
| FKs `account → customer`, `transfer → customer/account` | Legacy had none (DB2 host tables); the app already enforces ownership (`TransferService.java:149`). FKs cost nothing with this data volume and catch seed mistakes. |
| `UNIQUE (conf_nbr)` | Legacy relied on the sequence table; without a constraint a race could silently produce duplicate confirmation numbers (§6). |
| `CHECK` constraints on all code columns | Replace the implicit "only the app writes valid codes" assumption. `stat_cd IN ('A','C')` for accounts: legacy never writes a non-`A` value and treats any other value as closed; `C` is the DB2 convention named in the brief. |
| Case-insensitive unique index on `UPPER(user_id)` | Legacy `OLB_CUST_UX1` is case-sensitive but the lookup is case-insensitive (`CustomerDAO.java:13-15`), so `demo.user` and `DEMO.USER` could both exist and the login would return whichever HSQLDB found first. The functional index makes the legacy intent a guarantee. |
| `transfer_id BIGINT IDENTITY` | HSQLDB `INTEGER IDENTITY` starting at 0. Ids are never shown to users or used in URLs (`TransferConfirmAction.java:20-22` uses `conf_nbr`), so renumbering is safe. The seed below pins the legacy ids 0,1,2 anyway via `OVERRIDING SYSTEM VALUE` so `ORDER BY crt_ts DESC, transfer_id DESC` yields identical history order. |
| Dropped `OLB_CONF_SEQ` from app-level race handling | Replaced by the atomic upsert in §6; table shape unchanged. |

### 4.2 Column mapping

| Legacy | Target | Legacy | Target |
|---|---|---|---|
| `OLB_CUST.CUST_ID` | `olb_customer.customer_id` | `OLB_XFR.XFR_ID` | `olb_transfer.transfer_id` |
| `OLB_CUST.OLB_USER_ID` | `olb_customer.user_id` | `OLB_XFR.CONF_NBR` | `olb_transfer.conf_nbr` |
| `OLB_CUST.PSWD_HASH` | `olb_customer.password_hash` | `OLB_XFR.FROM_ACCT_ID` / `TO_ACCT_ID` | `olb_transfer.from_account_id` / `to_account_id` |
| `OLB_CUST.FIRST_NM` / `LAST_NM` | `olb_customer.first_name` / `last_name` | `OLB_XFR.AMT_CENTS` / `FEE_CENTS` | `olb_transfer.amt_cents` / `fee_cents` |
| `OLB_CUST.REL_TIER_CD` | `olb_customer.rel_tier_cd` | `OLB_XFR.XFR_TYP_CD` / `REL_TIER_CD` / `FREQ_CD` / `STAT_CD` | same names |
| `OLB_CUST.LAST_LOGIN_TS` / `FAIL_CNT` / `STAT_CD` | `olb_customer.last_login_ts` / `fail_cnt` / `stat_cd` | `OLB_XFR.SCHED_DT` / `POST_DT` / `MEMO` / `CRT_TS` / `CRT_CHNL_CD` | same names |
| `OLB_ACCT.ACCT_ID` | `olb_account.account_id` | `OLB_FEE_SCHED.*` | `olb_fee_schedule.*` (same names) |
| `OLB_ACCT.PROD_NM` / `EXT_BANK_NM` | `olb_account.product_name` / `ext_bank_name` | `OLB_BANK_HOL.HOL_DT` / `HOL_NM` | `olb_bank_holiday.holiday_dt` / `holiday_name` |
| `OLB_ACCT.ACCT_TYP_CD` / `ACCT_NBR_LAST4` / `CUR_BAL_CENTS` / `AVL_BAL_CENTS` / `SEQ_NO` / `STAT_CD` | same names | `OLB_CONF_SEQ.SEQ_DT` / `LAST_SEQ` | `olb_confirmation_seq.seq_dt` / `last_seq` |

---

## 5. Seed-data migration (Flyway `V2__seed.sql`)

Reproduces `seed.sql:1-59` exactly, with the **single deliberate change** that `PSWD_HASH` (unsalted MD5 `2ac9cb7dc02b3c0083eb70898e549b63` of `Password1`, `seed.sql:1-5`) becomes a bcrypt hash.

**bcrypt hash** (cost factor **12**, `$2a$` variant, generated with Spring Security `BCryptPasswordEncoder(12)` and verified with `matches("Password1", hash) == true`):

```
$2a$12$mizW3tD8IJ6jX/laR1Cr6euXdSBYdIvXf9jhmpxac22ssdhttgDAy
```

Both demo users share the same plaintext in legacy; in the target they share this one hash too (bcrypt's per-hash salt would make two independently generated hashes differ — using one literal keeps the seed deterministic; it does not weaken anything because the salt is embedded in the string).

```sql
-- V2__seed.sql — reproduces bofa-portal src/main/resources/sql/seed.sql exactly except password hashing.
-- Legacy run.sh sets -Duser.timezone=America/New_York, so legacy TIMESTAMP literals are ET wall-clock:
-- they are written here with an explicit offset (EDT = -04:00 for Sept/Oct 2026).

-- Customers (seed.sql:1-5). Password for both: Password1 (bcrypt cost 12).
INSERT INTO olb_customer (customer_id, user_id, password_hash, first_name, last_name, rel_tier_cd, last_login_ts, fail_cnt, stat_cd) VALUES
 (100042, 'demo.user', '$2a$12$mizW3tD8IJ6jX/laR1Cr6euXdSBYdIvXf9jhmpxac22ssdhttgDAy', 'Jordan', 'Rivera', '10', NULL, 0, 'A'),
 (100077, 'sam.chen',  '$2a$12$mizW3tD8IJ6jX/laR1Cr6euXdSBYdIvXf9jhmpxac22ssdhttgDAy', 'Sam',    'Chen',   '00', NULL, 0, 'A');

-- Accounts (seed.sql:7-12)
INSERT INTO olb_account (account_id, customer_id, acct_typ_cd, product_name, acct_nbr_last4, cur_bal_cents, avl_bal_cents, ext_bank_name, seq_no, stat_cd) VALUES
 ('ACCT-1001', 100042, 'DDA', 'Advantage Plus Banking - Checking', '1001',  421538,  421538, NULL,                        1, 'A'),
 ('ACCT-1002', 100042, 'SAV', 'Advantage Savings',                 '1002', 1294000, 1294000, NULL,                        2, 'A'),
 ('ACCT-1003', 100042, 'EXT', 'Chase Total Checking',              '4432',       0,       0, 'JPMorgan Chase Bank, N.A.', 3, 'A'),
 ('ACCT-2001', 100077, 'DDA', 'Advantage SafeBalance Banking',     '2001',   88012,   88012, NULL,                        1, 'A'),
 ('ACCT-2002', 100077, 'SAV', 'Advantage Savings',                 '2002',  250000,  250000, NULL,                        2, 'A');

-- Fee schedule (seed.sql:14-27). All amounts in cents.
INSERT INTO olb_fee_schedule (xfr_typ_cd, rel_tier_cd, fee_cents, daily_lim_cents, per_txn_lim_cents, eff_dt) VALUES
 ('INT', '00',   0, 99999999, 9999999, DATE '2019-01-01'),
 ('INT', '10',   0, 99999999, 9999999, DATE '2019-01-01'),
 ('INT', '20',   0, 99999999, 9999999, DATE '2019-01-01'),
 ('INT', '30',   0, 99999999, 9999999, DATE '2019-01-01'),
 ('EXS', '00',   0,   350000,  350000, DATE '2019-01-01'),
 ('EXS', '10',   0,   500000,  500000, DATE '2019-01-01'),
 ('EXS', '20',   0,  1000000, 1000000, DATE '2019-01-01'),
 ('EXS', '30',   0,  2500000, 2500000, DATE '2019-01-01'),
 ('EXN', '00', 300,   350000,  350000, DATE '2019-01-01'),
 ('EXN', '10',   0,   500000,  500000, DATE '2019-01-01'),
 ('EXN', '20',   0,  1000000, 1000000, DATE '2019-01-01'),
 ('EXN', '30',   0,  2500000, 2500000, DATE '2019-01-01');

-- Bank holidays (seed.sql:29-51)
INSERT INTO olb_bank_holiday (holiday_dt, holiday_name) VALUES
 (DATE '2026-01-01', 'New Year''s Day'),
 (DATE '2026-01-19', 'Martin Luther King Jr. Day'),
 (DATE '2026-02-16', 'Presidents Day'),
 (DATE '2026-05-25', 'Memorial Day'),
 (DATE '2026-06-19', 'Juneteenth'),
 (DATE '2026-07-03', 'Independence Day (observed)'),
 (DATE '2026-09-07', 'Labor Day'),
 (DATE '2026-10-12', 'Columbus Day'),
 (DATE '2026-11-11', 'Veterans Day'),
 (DATE '2026-11-26', 'Thanksgiving Day'),
 (DATE '2026-12-25', 'Christmas Day'),
 (DATE '2027-01-01', 'New Year''s Day'),
 (DATE '2027-01-18', 'Martin Luther King Jr. Day'),
 (DATE '2027-02-15', 'Presidents Day'),
 (DATE '2027-05-31', 'Memorial Day'),
 (DATE '2027-06-18', 'Juneteenth (observed)'),
 (DATE '2027-07-05', 'Independence Day (observed)'),
 (DATE '2027-09-06', 'Labor Day'),
 (DATE '2027-10-11', 'Columbus Day'),
 (DATE '2027-11-11', 'Veterans Day'),
 (DATE '2027-11-25', 'Thanksgiving Day'),
 (DATE '2027-12-24', 'Christmas Day (observed)');

-- Transfer history (seed.sql:53-59). transfer_id pinned to legacy HSQLDB IDENTITY values 0,1,2.
INSERT INTO olb_transfer (transfer_id, conf_nbr, customer_id, from_account_id, to_account_id, amt_cents, fee_cents, xfr_typ_cd, rel_tier_cd, freq_cd, sched_dt, post_dt, stat_cd, memo, crt_ts, crt_chnl_cd)
OVERRIDING SYSTEM VALUE VALUES
 (0, 'XFR260928-000014', 100042, 'ACCT-1001', 'ACCT-1002',  25000, 0, 'INT', '10', 'O', DATE '2026-09-28', DATE '2026-09-28', 'P', 'Vacation fund', TIMESTAMPTZ '2026-09-28 09:12:44-04:00', 'OLB'),
 (1, 'XFR261001-000203', 100042, 'ACCT-1002', 'ACCT-1001', 120000, 0, 'INT', '10', 'M', DATE '2026-10-01', DATE '2026-10-01', 'P', 'Rent',          TIMESTAMPTZ '2026-10-01 06:00:02-04:00', 'OLB'),
 (2, 'XFR261006-000091', 100042, 'ACCT-1001', 'ACCT-1003',  50000, 0, 'EXS', '10', 'O', DATE '2026-10-06', DATE '2026-10-09', 'S', NULL,            TIMESTAMPTZ '2026-10-06 18:40:19-04:00', 'OLB');
SELECT setval(pg_get_serial_sequence('olb_transfer', 'transfer_id'), 2, true);

-- olb_confirmation_seq is intentionally empty, exactly like legacy (first transfer of any day is -000001).
```

Legacy `seed.sql` has 44 statements (each `INSERT` is one row — `StartupListener` log: "Executed 44 statements from sql/seed.sql" **[verified live]**): 2 customers + 5 accounts + 12 fee rows + 22 holidays + 3 transfers = 44. The target seed above has the same 44 rows.

### 5.1 Inconsistencies / quirks found in the legacy seed

| # | Observation | Source | Treatment in target |
|---|---|---|---|
| S1 | **Seeded history is not reflected in balances.** `XFR261006-000091` is a *scheduled* `$500.00` external transfer from `ACCT-1001`, which per R9 (`TransferService.java:112-116`) should have placed a hold, yet `ACCT-1001` is seeded with `CUR = AVL = 421538`. Likewise the posted `$250` and `$1,200` internal transfers are not derivable from the seeded balances (no opening balance exists). | `seed.sql:7, 53-59` | Reproduce as-is — the brief requires an exact copy and acceptance tests are written against these numbers. Flagged for the build session. |
| S2 | The seeded `EXS` transfer on Tue 2026-10-06 (created 18:40 ET, before cutoff) has `POST_DT = 2026-10-09` = 3 business days later, which is consistent with `BusinessCalendar.addBusinessDays` (`BusinessCalendar.java:69-77`). ✔ | `seed.sql:58`; `BusinessCalendar.java:69-77` | — |
| S3 | `XFR261001-000203` is `FREQ_CD='M'` (monthly, memo "Rent") but there is no recurrence engine and no follow-on rows. | `seed.sql:56`; `TransferService.java:155-157` | Reproduce. Note in acceptance criteria that `W`/`M` is stored but not executed. |
| S4 | Confirmation sequence counters (`000014`, `000203`, `000091`) imply other customers' transfers on those days that are not in the seed; `OLB_CONF_SEQ` is not seeded, so a new transfer on, say, 2026-10-06 would be numbered `XFR261006-000001`, *below* the seeded `000091`. Only matters for backdated tests. | `seed.sql:53-59`; `TransferDAO.java:122-148` | Reproduce (empty counter table); the `UNIQUE (conf_nbr)` constraint would surface a collision loudly instead of silently. |
| S5 | **Holiday table does not follow Federal Reserve rules for Saturday holidays.** Fed rule: "For holidays falling on Saturday, Federal Reserve Banks and Branches will be open the preceding Friday" (federalreserve.gov K.8). The seed closes Fri 2026-07-03, Fri 2027-06-18 and Fri 2027-12-24, i.e. it follows the **federal-employee** observance rather than the bank calendar. Sunday → Monday rows (2027-07-05) are correct. | `seed.sql:35, 45, 51` | Reproduce exactly (legacy is the source of truth and the "next business day from Fri 2026-10-09 = Tue 2026-10-13" verified fact depends on this table). Flag to product. |
| S6 | Holiday table only covers 2026–2027. Dates after 2027-12-31 will treat every weekday as a business day. | `seed.sql:29-51` | Reproduce; add a runbook note to extend yearly. |
| S7 | `INT` fee rows carry `DAILY_LIM_CENTS = 99999999` / `PER_TXN_LIM_CENTS = 9999999` but the code ignores both for `INT` and uses the hard-coded `9_999_999` cap instead. The values happen to agree, so behaviour is identical. | `seed.sql:16-19`; `TransferService.java:46, 177-186` | Reproduce. Target may read the row instead of the constant — same result. |
| S8 | External account `ACCT-1003` has `CUR_BAL = AVL_BAL = 0` and is listed with the customer's own accounts; the UI shows `$0.00` for it (`transfer.jsp:50`). Legitimate "we don't know the other bank's balance" placeholder, but visually odd. | `seed.sql:9` | Reproduce; UI spec may hide balance for `EXT`. |
| S9 | **Demo customer surname mismatch.** The legacy README says "Jordan **Reyes**" (`README.md:46`) but the seed row and the running app say "Jordan **Rivera**" (`seed.sql:3`). The SQL is what the app executes, so the target seeds **Rivera**. | `seed.sql:3`; `README.md:46` | Rivera. |
| S10 | Both users share one password and `PSWD_HASH` is unsalted, so the two rows are byte-identical — anyone with DB read access learns that both users have the same password. | `seed.sql:1-5` | Fixed by bcrypt (even with the shared literal above, a production seed would hash each user independently). |
| S11 | `LAST_LOGIN_TS` is `NULL` for both seeded customers (never logged in). | `seed.sql:1-5` (column omitted → default NULL) | Reproduce. |

---

## 6. Confirmation-number sequence `XFRyyMMdd-nnnnnn`

### 6.1 Legacy algorithm

```
TransferService.submit                                        (TransferService.java:76-133)
  cn.setAutoCommit(false)
  today = calendar.today()                 -- ET calendar date      (BusinessCalendar.java:27-31)
  conf  = buildConfirmationNumber(cn, today)                    (TransferService.java:237-244)
            seq = transferDAO.nextConfirmationSeq(cn, today)     (TransferDAO.java:122-148)
                    SELECT LAST_SEQ FROM OLB_CONF_SEQ WHERE SEQ_DT = ?
                    if row:  next = LAST_SEQ + 1; UPDATE OLB_CONF_SEQ SET LAST_SEQ = ? WHERE SEQ_DT = ?
                    else:    next = 1;            INSERT INTO OLB_CONF_SEQ VALUES (?, 1)
            "XFR" + yyMMdd(today, TZ=America/New_York) + "-" + zero-pad-6(seq)
  ... balance updates, INSERT OLB_XFR ...
  cn.commit()
```

* Format: `XFR` + 2-digit year + month + day + `-` + 6-digit zero-padded counter → always 16 characters (fits `CHAR(16)`). **[verified live]** first transfer on 2026-10-09 → `XFR261009-000001`, second → `XFR261009-000002`.
* The counter resets per ET calendar day (`SEQ_DT` PK). Nothing rolls it after 999999; the padding loop (`while (n.length() < 6)`) would simply produce a 7-digit suffix and the `CHAR(16)` insert would fail/truncate — unreachable in practice.
* The date used is the ET *calendar* date (`today`), not the business date: a transfer submitted Sat 2026-10-10 gets `XFR261010-…` even though its `SCHED_DT` is also 10-10 and it posts/schedules per business rules.

### 6.2 Why legacy is unsafe under concurrency

`SELECT` then `UPDATE`/`INSERT` is a classic read-modify-write race. With default isolation (READ COMMITTED on DB2/HSQLDB) two concurrent `submit`s on the same date can both read `LAST_SEQ = 5` and both write 6 → two transfers with the same `CONF_NBR`, and `OLB_XFR` has no unique constraint to catch it. Two first-of-day submits can both take the `INSERT` branch; one fails on the `SEQ_DT` PK and the whole transfer rolls back with a generic error. Legacy "gets away with it" because DBCP allows 8 connections and demo traffic is single-user.

### 6.3 Target: atomic upsert in PostgreSQL (recommended)

Keep the table (`olb_confirmation_seq`) and replace the two-statement dance with one atomic statement executed **inside the same transaction** as the balance updates and the `olb_transfer` insert:

```sql
INSERT INTO olb_confirmation_seq (seq_dt, last_seq)
VALUES (:business_date, 1)
ON CONFLICT (seq_dt) DO UPDATE
   SET last_seq = olb_confirmation_seq.last_seq + 1
RETURNING last_seq;
```

* `INSERT … ON CONFLICT DO UPDATE` takes a row lock on the `seq_dt` row; concurrent callers serialise on that one row and each sees the other's committed increment (PostgreSQL re-evaluates the `DO UPDATE` against the latest committed tuple under READ COMMITTED). No gaps unless a transaction rolls back after taking a number — acceptable and identical to legacy semantics (legacy also "burns" a number on rollback since the update happens before the insert).
* Lock hold time is the rest of the transfer transaction (a few ms); only transfers on the same date contend, which matches the legacy grain.
* Java (Spring Data JPA): `@Modifying @Query(nativeQuery=true, value="…RETURNING last_seq")` or `JdbcTemplate.queryForObject`, called from the `@Transactional` transfer service; format with `String.format("XFR%s-%06d", DateTimeFormatter.ofPattern("yyMMdd").format(etDate), seq)`.
* `UNIQUE (conf_nbr)` on `olb_transfer` is the belt to this suspenders: a duplicate would fail the insert rather than create two transfers with one number.
* Alternative considered — one PostgreSQL `SEQUENCE` per day (`CREATE SEQUENCE conf_seq_261009`) or a single global sequence: sequences are non-transactional (gaps on rollback, fine) but per-day creation needs DDL at runtime and a global sequence would not reset daily, breaking the `000001` observable behaviour. The upsert keeps the exact legacy numbering.
* Alternative considered — `SELECT … FOR UPDATE` + `UPDATE`: correct but two round trips and still needs an insert-race guard for the first row of the day.

Reset day boundary: `:business_date` must be computed as `LocalDate.now(ZoneId.of("America/New_York"))` (see §9.3), never `CURRENT_DATE` of a UTC database.

---

## 7. End-of-life component inventory

Legacy versions from `pom.xml:19-117`, `run.sh:3-5`, `index.jsp:20-21` / `transfer.jsp:22-23`. EOL dates and CVE IDs are from the vendors' public advisories/NVD; the brief asked for notable CVEs, not an exhaustive list.

| Component | Legacy version | Source | EOL | Notable CVEs | Target replacement |
|---|---|---|---|---|---|
| Apache Struts 1 | 1.3.10 (`struts-core`, `struts-taglib`, `struts-extras`) | `pom.xml:26-41` | Struts 1 EOL announced 2008-12 (1.3.10 was the final release); project formally retired 2013-04-05 | CVE-2014-0114 (ClassLoader manipulation via `class.classLoader` form property, RCE — Struts 1 never fixed, Tomcat shipped mitigations), CVE-2015-0899 (`MultiPageValidator` validation bypass), CVE-2016-1181 / CVE-2016-1182 (`ActionServlet` object mutation via `/` requests, validator XSS), CVE-2008-2025 (taglib XSS), CVE-2006-1546/1547/1548 (validation bypass, DoS, info leak) | Spring Boot 3.3.x (Spring MVC 6.1 `@RestController`s) — the Struts actions/forms become controllers + request DTOs with Bean Validation |
| JSP / Servlet API / JSTL | JSP 2.1, Servlet 2.5, JSTL 1.2 (`provided`) | `pom.xml:43-60` | Servlet 2.5 (2006) superseded; no security maintenance | n/a (spec jars) | React 18 + TypeScript 5 + Vite 5 SPA; Spring Boot embedded Tomcat 10.1 (Servlet 6.0) for the API only |
| jQuery | 1.7.2 (CDN `code.jquery.com/jquery-1.7.2.min.js`) | `index.jsp:20-21`; `transfer.jsp:22-23`; `js/olb.js:1-2` | 1.x branch EOL 2016 (last 1.12.4); jQuery Foundation dropped all 1.x/2.x support 2021 | CVE-2011-4969 (XSS via location.hash selector, < 1.6.3 — fixed, listed for lineage), CVE-2012-6708 (`$(html)` XSS, < 1.9.0), CVE-2015-9251 (cross-domain AJAX text/javascript execution, < 3.0.0), CVE-2019-11358 (`$.extend` prototype pollution, < 3.4.0), CVE-2020-11022 / CVE-2020-11023 (`htmlPrefilter` XSS, < 3.5.0) | No jQuery. React 18 + `fetch`; the AJAX quote refresh (`js/olb.js:11-36`) becomes a debounced React query hook |
| log4j | 1.2.17 | `pom.xml:79-84` | EOL 2015-08-05 (Apache announcement) | CVE-2019-17571 (`SocketServer` deserialisation RCE), CVE-2020-9488 (SMTPAppender TLS hostname), CVE-2021-4104 (`JMSAppender` JNDI RCE), CVE-2022-23302 (`JMSSink`), CVE-2022-23305 (`JDBCAppender` SQLi), CVE-2022-23307 (Chainsaw deserialisation). *Not* affected by Log4Shell CVE-2021-44228 (that is 2.x), but 1.2 has no fix path for any of the above. | SLF4J 2 + Logback 1.5 (Spring Boot default), JSON encoder for structured logs; `log4j.properties:1-6` levels map to `logging.level.*` in `application.yml` |
| Apache Tomcat | 7.0.109 | `run.sh:3`; `README.md` | 7.0.x EOL 2021-03-31 (7.0.109 is the final release) | Post-EOL unfixed in 7.0.x: CVE-2021-25329 (session persistence RCE, fixed only in 7.0.108 — ok), CVE-2021-30639 (NIO2 DoS), CVE-2021-33037 (HTTP request smuggling, fixed in 7.0.109 — ok), CVE-2021-41079 (TLS DoS), CVE-2022-42252 (request smuggling via invalid Content-Length), CVE-2023-28708 (JSESSIONID without `Secure` behind RFC 7239 proxy), CVE-2023-45648 (trailer header smuggling), CVE-2024-24549 / CVE-2024-23672 (HTTP/2, WebSocket DoS) — none will be back-ported to 7.0 | Spring Boot 3.3.x embedded Tomcat 10.1.x (Jakarta EE 10), run as a non-root container; or swap to Undertow/Jetty via starter |
| HSQLDB | 1.8.0.10 (`runtime`) | `pom.xml:62-67` | 1.8 branch last release 2010-04; superseded by 2.x (2010). Project ships no 1.8 fixes | CVE-2022-41853 (arbitrary static method call via `CALL` / stored procedures when untrusted SQL is accepted, affects < 2.7.1 — 1.8 never patched); CVE-2024-xxxx-class issues all target 2.x. Legacy mitigates by parameterising all SQL. | PostgreSQL 16.x (prod & local via Docker); H2 is **not** used even for tests — Testcontainers runs real PostgreSQL |
| Commons DBCP | 1.4 | `pom.xml:69-72` | Superseded by DBCP 2 (2014) | No direct CVEs; Java 6 era, no fixes | HikariCP 5.1 (Spring Boot default) |
| Commons Lang | 2.6 | `pom.xml:73-77` | Lang 2.x EOL 2011 (3.0 release) | None direct; `StringEscapeUtils.escapeJavaScript` (used in `TransferQuoteAction.java:48-57` to hand-roll JSON) is the risk surface | Jackson 2.17 for JSON; no manual escaping |
| Java | source/target 1.7, run on OpenJDK 8 | `pom.xml:19-23`; `run.sh:3` | Java 7 public EOL 2015-04 (Oracle), extended support ended 2022-07; Java 8 Oracle public EOL 2019-01 (commercial), OpenJDK 8 community updates continue (Temurin) through at least 2026 but with no modern TLS/JIT features | Java 7: CVE-2015-4852 (CommonsCollections gadget deserialisation ecosystem), dozens of unpatched JRE CVEs post-2015; Java 8u-old: CVE-2019-2422, CVE-2020-2803 etc. per CPU | **Java 21 LTS** (Eclipse Temurin 21.0.x) |
| JUnit | 4.11 | `pom.xml:86-91` | 4.x maintenance only | CVE-2020-15250 (`TemporaryFolder` world-readable temp dir, < 4.13.1) | JUnit 5.10 (Jupiter) + Testcontainers 1.19 + AssertJ |
| Maven plugins | compiler 3.1, war 2.4, surefire 2.17 | `pom.xml:94-117` | Ancient but build-time only | — | Maven 3.9 / Spring Boot Maven plugin 3.3 (or Gradle 8); compiler 3.13 with `<release>21</release>` |
| Auth hashing | `java.security.MessageDigest("MD5")`, unsalted | `AuthService.java:37-53` | MD5 for passwords deprecated since ~2005 | Not a CVE but a CWE-328/CWE-759 finding; `seed.sql:1` cites internal ticket OLB-2211 | Spring Security 6.3 `BCryptPasswordEncoder` strength 12 wrapped in `DelegatingPasswordEncoder` |

---

## 8. Security debt → modern equivalent

| # | Legacy behaviour (what it DOES) | Source | Target |
|---|---|---|---|
| 8.1 **Password hashing** | Unsalted MD5, hex-lowercased, compared case-insensitively against `CHAR(32)`. Same password → same hash for every user. No password change flow. | `AuthService.java:28, 37-53`; `seed.sql:1-5` | `BCryptPasswordEncoder(12)` (~250 ms/hash on a modern core — fine for a login endpoint, prohibitive for offline cracking). Store as `{bcrypt}`-less raw `$2a$12$…` in `password_hash VARCHAR(72)`; use `DelegatingPasswordEncoder` so a future upgrade to Argon2id is a config change. Never reuse legacy MD5 hashes: seed with the hash in §5 and, if real customers existed, force a reset on first login. |
| 8.2 **Lockout** | Exactly 3 consecutive failures → `STAT_CD='L'`, permanent until a CICS unlock; success resets `FAIL_CNT`. The *third* failing attempt already returns the "locked" message. Unknown user ids are not counted. Message reveals whether the account is locked vs. wrong password. | `CustomerDAO.java:43-62`; `AuthService.java:23-34` **[verified live]** | Preserve semantics 1:1 (product rule): `fail_cnt` + `stat_cd` columns, same `UPDATE … CASE WHEN fail_cnt+1 >= 3` in one statement inside the auth transaction. Implement as a Spring Security `AuthenticationProvider` / `UserDetailsService` that throws `LockedException` when `stat_cd='L'`. Keep the two distinct messages (matches legacy UX; the acceptance tests assert them) but document the user-enumeration trade-off; no unlock endpoint in scope. Add an auth-failure rate limit per IP (Bucket4j) as defence in depth — not a legacy behaviour, must not change the 3-strike outcome. |
| 8.3 **Session / timeout** | Container `HttpSession`, `<session-timeout>10</session-timeout>` minutes idle; `JSESSIONID` cookie `Path=/; HttpOnly` (Tomcat default), **no `Secure`, no `SameSite`**; session id also exposed in the URL on the post-login redirect (`transfer.do;jsessionid=…`). Login invalidates any prior session (fixation defence) and stores the `Customer` object. Expired session → redirect to `index.jsp?expired=1` ("Your session has expired"). Sign-out invalidates. | `web.xml:57-59`; `LoginAction.java:47-51`; `AuthFilter.java:22-29`; `LogoutAction.java` **[verified live]** | **Recommendation: server-side session (Spring Session JDBC in PostgreSQL) with a 10-minute idle timeout — not JWT.** Reasons: the 10-minute idle timeout is a *product rule* to preserve unless the user says otherwise; idle-timeout and instant revocation (sign-out, lockout) are trivial with server sessions and awkward with stateless JWTs; the app is a single SPA + single API. Config: `server.servlet.session.timeout=10m`, `spring.session.store-type=jdbc`, cookie `SESSION` with `HttpOnly; Secure; SameSite=Lax; Path=/`, `server.servlet.session.tracking-modes=cookie` (never URL). SPA shows the legacy "session expired" banner on a 401 from `/api/**`. If the user later wants JWT: 10-minute access token + rotating refresh token in an `HttpOnly` cookie with a server-side revocation list — more moving parts for the same result. |
| 8.4 **CSRF** | No CSRF token anywhere; Struts 1 forms and the AJAX quote are plain `POST`s authenticated only by the session cookie. (Struts 1 has `saveToken/isTokenValid` but the app does not call them.) | `transfer.jsp:77-120`; `index.jsp:32-39`; `js/olb.js:11-36`; `struts-config.xml:7-64` | Spring Security `CookieCsrfTokenRepository.withHttpOnlyFalse()` + `XorCsrfTokenRequestAttributeHandler`; React reads `XSRF-TOKEN` and sends `X-XSRF-TOKEN` on every mutating call. `SameSite=Lax` on the session cookie is the second layer. |
| 8.5 **Cache headers** | `AuthFilter` sets `Cache-Control: no-cache, no-store` (unauth) / `no-cache, no-store, must-revalidate` + `Pragma: no-cache` (auth) on `/secure/*`; Struts `nocache="true"` adds `Cache-Control: no-cache,no-store,max-age=0` + `Pragma: No-cache` on all `*.do`. Static assets and `index.jsp` are cacheable. | `AuthFilter.java:27-32`; `struts-config.xml:60` **[verified live]** | Spring Security headers defaults already emit `Cache-Control: no-cache, no-store, max-age=0, must-revalidate`, `Pragma: no-cache`, `Expires: 0` on every API response; keep them. Frontend build assets are content-hashed and may be `immutable`; `index.html` `no-cache`. |
| 8.6 **Cookie flags** | `olb_uid` = the sign-in user id in **plaintext**, `Max-Age=1y`, `Path=/<ctx>`, **no `HttpOnly`, no `Secure`, no `SameSite`**; set to empty/`Max-Age=0` when "Save user ID" is unchecked. Read back by `index.jsp` to prefill the field. | `LoginAction.java:53-56`; `index.jsp` (cookie read) **[verified live]**: `Set-Cookie: olb_uid=demo.user; Expires=…2027; Path=/` | Keep the feature (product rule) but: `Secure; SameSite=Lax; HttpOnly` — the SPA does not need JS access if the server renders the remembered id into a `GET /api/auth/remembered-user` response, or store the remembered id in `localStorage` client-side only and drop the cookie entirely (preferred: nothing identifying leaves the browser unencrypted). Session cookie: `HttpOnly; Secure; SameSite=Lax`. |
| 8.7 **Transport security headers** | None: no HSTS, CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`. Served over plain HTTP on 8080. | `web.xml` (no filter), **[verified live]** response headers | Spring Security defaults give `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 0`, HSTS (when HTTPS). Add `Content-Security-Policy: default-src 'self'; img-src 'self' data:; frame-ancestors 'none'` and `Referrer-Policy: strict-origin-when-cross-origin`. TLS terminates at the ingress/reverse proxy; backend trusts `X-Forwarded-*` only from it (`server.forward-headers-strategy=framework`). |
| 8.8 **Input validation** | Struts `ActionForm`s hold raw strings; validation is manual in `LoginAction.validate` (required fields) and `TransferService.buildQuote` (R1–R7). Amount regex `-?\d{1,13}(\.\d{0,2})?`; `$`/`,` stripped; memo trimmed, truncated? — **no**, a >60-char memo would fail the `VARCHAR(60)` insert with a generic error page. Account ids and tier code are client-supplied and validated against the DB (ownership, fee row). Dates parsed `MM/dd/yyyy`, lenient=false, in ET; blank → today. | `LoginAction.java:27-36`; `TransferService.java:138-157`; `Money.java:35-50`; `TransferService.java:222-234` | Bean Validation on request DTOs: `@NotBlank @Pattern(regexp=legacy regex) amount`, `@Size(max=60) memo`, `@Pattern(^(00|10|20|30)$) tierCode`, `@Pattern(^(EXS|EXN)$) delivery`, `@Pattern(^[OWM]$) frequency`, `@Pattern(^\d{2}/\d{2}/\d{4}$) scheduledDate`; then the same domain checks in the service, returning the legacy message keys. Treat everything from the client as untrusted, including account ids (re-check ownership server-side exactly as `TransferService.java:149`). Reject, don't truncate, to match legacy. |
| 8.9 **Error-message leakage** | Global `error.jsp` (for any `Throwable` and 404) prints `Error reference: ERR-<hex millis>` **and the exception class name** (`exception.getClass().getName()`). Stack traces go to the Tomcat log only. Quote JSON returns only the resource-bundle message. | `error.jsp:15-17`; `web.xml:65-72`; `TransferQuoteAction.java:35-46` **[verified live]** 404 → `ERR-1A120B11693` | `@RestControllerAdvice` returning RFC 7807 `ProblemDetail` with a correlation id (`traceId` from Micrometer) and the legacy message key/text; never the exception class, never SQL state. Spring Boot `server.error.include-*=never`. Keep the `ERR-…` reference concept as the correlation id so support flows are unchanged. |
| 8.10 **Logging of sensitive data** | `INFO` on every transfer with confirmation number, status, `cust=`, `from=`/`to=` account ids, amount and fee in cents; `WARN "Sign-in failed for user <userId as typed>"`; `INFO "Sign-in OK cust=…"`; `com.bankofamerica.olb` at `DEBUG`. Passwords are never logged. Console appender only, pattern `%d{yyyy-MM-dd HH:mm:ss} %-5p [%c{1}] %m%n` (ET timestamps). | `TransferService.java:120-121`; `LoginAction.java:42, 58`; `log4j.properties:1-6` | Structured JSON logs (Logback + `logstash-logback-encoder`) with `traceId`; log `customerId` and `confNbr` (needed for audit), log account ids as last-4 only, **do not log the typed user id on failed sign-in** (it may be a password typed in the wrong box) — log a hash or nothing plus the IP/user-agent; amounts may be logged (not PCI/PII) but prefer the business-event stream. Default level `INFO`; `DEBUG` never in prod. Timestamps in UTC ISO-8601 with offset. |
| 8.11 **SQL injection** | None found — every DAO uses `PreparedStatement` placeholders; `UPPER(OLB_USER_ID)=UPPER(?)`. | all `dao/*.java` | Spring Data JPA / `JdbcTemplate` parameters; no string-built SQL. |
| 8.12 **XSS** | JSP output is escaped (`fn:escapeXml` / `<c:out>` / `StringEscapeUtils.escapeHtml`) on the paths inspected; quote JSON is hand-built with `escapeJavaScript`. jQuery 1.7.2 itself has XSS CVEs (§7). | `confirm.jsp`, `transfer.jsp`, `TransferQuoteAction.java:48-57` | React escapes by default; Jackson produces JSON; CSP as in 8.7. |
| 8.13 **Session object contents** | The whole `Customer` (incl. nothing secret — the hash is kept outside the model in a `StringBuffer`) is stored in the session; the quote is recomputed each request, the last confirmation number is kept in session. | `AuthService.java:24-25`; `BaseAction.java`; `TransferSubmitAction.java:30-33` | Session holds only the principal (`customerId`, `userId`, tier). Confirmation page fetches by `conf_nbr` scoped to the principal exactly as `TransferDAO.findByConfirmation` does (`TransferDAO.java:57-70`). |

---

## 9. Local run / test platform

### 9.1 Recommended repo layout for bofa-modernized

```
bofa-modernized/
├── docs/                      01-acceptance-criteria.md, 02-ui-spec.md, 03-data-and-platform.md (this), 04-traceability.md
├── backend/                   Spring Boot 3.3 / Java 21 (Maven)
│   ├── pom.xml
│   ├── src/main/java/com/bofa/olb/
│   │   ├── api/               REST controllers, request/response DTOs, ProblemDetail advice
│   │   ├── application/       TransferService, AuthService, BusinessCalendar (ports of the legacy service/ package)
│   │   ├── domain/            Account, Customer, Transfer, TransferQuote, Money, code enums
│   │   └── infrastructure/    JPA entities/repositories, ConfirmationSequenceRepository (upsert), Spring Security config, Spring Session
│   ├── src/main/resources/
│   │   ├── application.yml
│   │   └── db/migration/      V1__schema.sql (§4), V2__seed.sql (§5)
│   └── src/test/java/…        JUnit 5 unit tests + @SpringBootTest Testcontainers integration tests
├── frontend/                  React 18 + TypeScript (strict) + Vite 5
│   ├── src/{pages,components,api,lib}/
│   └── vitest + Testing Library
├── e2e/                       Playwright acceptance tests, one spec per R1–R10 / AC id
├── docker-compose.yml         postgres + backend + frontend (dev)
├── .github/workflows/ci.yml   backend (mvn verify w/ Testcontainers), frontend (lint/type/test/build), e2e (compose up + playwright)
└── README.md
```

### 9.2 docker-compose (dev)

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: olb
      POSTGRES_USER: olb
      POSTGRES_PASSWORD: olb            # dev only; real secrets come from the platform's secret store
      TZ: UTC                           # DB clock stays UTC on purpose; business dates are computed in the app (§9.3)
    ports: ["5432:5432"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U olb -d olb"]
      interval: 5s
      timeout: 3s
      retries: 20
    volumes:
      - pgdata:/var/lib/postgresql/data

  backend:
    build: ./backend                    # eclipse-temurin:21-jre multi-stage image
    depends_on:
      postgres: { condition: service_healthy }
    environment:
      SPRING_DATASOURCE_URL: jdbc:postgresql://postgres:5432/olb
      SPRING_DATASOURCE_USERNAME: olb
      SPRING_DATASOURCE_PASSWORD: olb
      SPRING_FLYWAY_ENABLED: "true"
      OLB_BUSINESS_ZONE: America/New_York   # replaces -Duser.timezone (run.sh:13)
      OLB_CUTOFF_HOUR: "20"                 # replaces web.xml:26-28 olb.cutoff.hour
      SERVER_SERVLET_SESSION_TIMEOUT: 10m   # web.xml:57-59
      TZ: UTC                               # container clock stays UTC — the app must not depend on it
    ports: ["8080:8080"]
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://localhost:8080/actuator/health"]
      interval: 10s
      retries: 10

  frontend:
    build: ./frontend                   # vite build → nginx:alpine serving /, proxying /api → backend
    depends_on: [backend]
    ports: ["5173:80"]

volumes:
  pgdata: {}
```

Developer loop: `docker compose up postgres` + `./mvnw spring-boot:run` (backend on 8080, Flyway applies V1/V2 on boot) + `npm run dev` (Vite on 5173 with `/api` proxy to 8080). Demo logins remain `demo.user` / `Password1` and `sam.chen` / `Password1`. Legacy ran on `http://localhost:8080/` (`run.sh:5`); the API lives under `/api/**` to avoid any collision with the SPA routes.

### 9.3 Timezone handling — making the 8 PM ET cutoff survive UTC containers

What legacy relies on (`run.sh:13` `-Duser.timezone=America/New_York`):

| Legacy call | Behaviour under ET default TZ | Source |
|---|---|---|
| `BusinessCalendar.today()` / `isAfterCutoff()` | Explicitly use `GregorianCalendar(EASTERN)` — correct regardless of default TZ. | `BusinessCalendar.java:17, 27-36` |
| `toSqlDate(Calendar)` → `java.sql.Date` | Takes the ET calendar's y/m/d and calls `Date.valueOf("yyyy-MM-dd")`, which yields **default-TZ** midnight; `ps.setDate` then lets HSQLDB render it in the JVM TZ — round-trips only because the JVM TZ is ET. Under a UTC JVM the ET date would still be computed correctly, but a `java.sql.Date` read back from a DB in another zone can shift by a day — `java.sql.Date` is simply unsafe once JVM TZ ≠ DB TZ. | `BusinessCalendar.java:105-107`; `TransferDAO.java:40-41, 96` |
| `new Timestamp(System.currentTimeMillis())` for `CRT_TS` | Stored/displayed as ET wall-clock. | `TransferService.java:99`; `confirm.jsp:8-9, 44` (`SimpleDateFormat("MM/dd/yyyy hh:mm a z")` with `setTimeZone(EASTERN)` → "EDT") |
| `CURRENT_DATE` in the fee-schedule lookup | Database clock = JVM clock = ET. | `FeeScheduleDAO.java:83` |
| `SimpleDateFormat("yyMMdd").setTimeZone(EASTERN)` for the confirmation number | Explicitly ET — correct. | `TransferService.java:239-240` |
| Scheduled-date parsing `MM/dd/yyyy` | `SimpleDateFormat` with `setTimeZone(EASTERN)`, re-formatted to `yyyy-MM-dd` and `Date.valueOf` — explicitly ET, then the same `java.sql.Date` caveat as above. | `TransferService.java:222-234` |

Target rules (make the business zone explicit, never rely on process TZ):

1. **One injected `Clock` and one `ZoneId`** (`OLB_BUSINESS_ZONE=America/New_York`). `BusinessCalendar.today() = LocalDate.now(clock.withZone(zone))`; `isAfterCutoff() = LocalTime.now(clock.withZone(zone)).getHour() >= cutoffHour`. Tests inject `Clock.fixed(...)` to pin "Fri 2026-10-09 19:59 ET" vs "20:00 ET".
2. **Business dates are `java.time.LocalDate` ↔ PostgreSQL `DATE`** (`sched_dt`, `post_dt`, `eff_dt`, `holiday_dt`, `seq_dt`). JDBC 4.2 maps `LocalDate` without any TZ conversion, so a UTC container is harmless. Never use `java.sql.Date` / `java.util.Date`.
3. **Instants are `Instant`/`OffsetDateTime` ↔ `TIMESTAMPTZ`** (`crt_ts`, `last_login_ts`). Render in the UI as `America/New_York` with zone suffix ("Submitted 10/09/2026 08:44 AM EDT"), matching `confirm.jsp:8-9, 44`.
4. **Never use the database clock for business logic**: the fee-schedule effective-date filter becomes `WHERE eff_dt <= :businessToday` with the parameter from `BusinessCalendar.today()`; the confirmation-sequence upsert takes `:business_date` the same way (§6.3). `CURRENT_DATE`/`now()` in SQL are allowed only for `crt_ts DEFAULT now()` (an instant).
5. **Containers run with `TZ=UTC`** (compose above) *and* CI asserts it: an integration test sets `TZ=UTC` via Testcontainers env and `-Duser.timezone=UTC` in Surefire, then checks that a transfer submitted at `2026-10-09T23:30:00Z` (19:30 ET) gets `XFR261009-…`, `sched_dt = 2026-10-09`, and that one at `2026-10-10T00:30:00Z` (20:30 ET, after cutoff) still gets `XFR261009-…` with `sched_dt = 2026-10-09` but an `EXN` `post_dt` of `2026-10-13` (Sat/Sun/Columbus Day skipped — the verified legacy answer).
6. **Frontend**: never compute business dates in the browser (the user's TZ is unknown); the quote API returns `postDt` and the formatted delivery label. Date inputs are sent as `MM/dd/yyyy` strings exactly as legacy (`TransferService.java:222-234`).
7. **Holidays**: `olb_bank_holiday` is loaded into the calendar per request as legacy does (`FeeScheduleDAO.java:94-108`); cache with a 1-hour TTL at most. Saturday/Sunday are non-business days in code, not in the table (`BusinessCalendar.java:39-45`).

### 9.4 Testcontainers for integration tests

```java
@SpringBootTest
@Testcontainers
class TransferServiceIT {
    @Container @ServiceConnection                 // Spring Boot 3.1+: wires datasource URL/user/password automatically
    static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16-alpine").withEnv("TZ", "UTC");

    @MockBean Clock clock;                        // or a @TestConfiguration bean: Clock.fixed(Instant.parse("2026-10-09T16:00:00Z"), UTC)
    ...
}
```

* Flyway runs `V1__schema.sql` + `V2__seed.sql` against the container on context start, so every IT starts from the exact legacy seed (Jordan `$4,215.38` / `$12,940.00`, Sam `$880.12` / `$2,500.00`, 12 fee rows, 22 holidays, 3 transfers).
* Use `@Transactional` rollback per test or `@Sql` truncate+reseed of `olb_transfer`/`olb_account`/`olb_confirmation_seq`; the container is reused across the module (`testcontainers.reuse.enable=true` in `~/.testcontainers.properties` for local speed).
* Concurrency test for §6: 50 virtual threads submit transfers on the same business date inside one container; assert 50 distinct `conf_nbr` ending `000001`…`000050` and `last_seq = 50`.
* Reg D / daily-limit tests pin the clock and insert prior rows with `sched_dt` in the current ET month/day — the `DATE` columns make this TZ-proof.
* No H2, no `ddl-auto`: `spring.jpa.hibernate.ddl-auto=validate` so entity drift against the Flyway DDL fails fast.
* Frontend: Vitest + Testing Library unit tests; MSW to mock `/api/quote`.
* E2E: Playwright against `docker compose up` (`e2e/`), one spec per acceptance criterion; the backend exposes a **test-only** `POST /api/test/clock` (profile `e2e`) to pin the business clock so "Friday before cutoff" scenarios are deterministic.

### 9.5 Backend `application.yml` essentials

```yaml
spring:
  datasource.url: ${SPRING_DATASOURCE_URL:jdbc:postgresql://localhost:5432/olb}
  jpa.hibernate.ddl-auto: validate
  jpa.properties.hibernate.jdbc.time_zone: UTC
  flyway.enabled: true
  session.store-type: jdbc
  session.jdbc.initialize-schema: always
server:
  servlet.session.timeout: 10m                  # web.xml:57-59 — product rule
  servlet.session.cookie: { http-only: true, secure: true, same-site: lax, name: SESSION }
  servlet.session.tracking-modes: cookie
  error: { include-message: never, include-stacktrace: never, include-exception: false }
olb:
  business-zone: America/New_York               # run.sh:13
  cutoff-hour: 20                               # web.xml:26-28
  lockout-threshold: 3                          # CustomerDAO.java:53-54
  internal-per-txn-cap-cents: 9999999           # TransferService.java:46
  history-limit: 10                             # TransferDAO.java:77
logging:
  level: { root: INFO, com.bofa.olb: INFO }     # log4j.properties:1-6 (legacy DEBUG → INFO)
```

---

## 10. Decisions and assumptions made in this document

| # | Decision | Rationale |
|---|---|---|
| D1 | Money = `BIGINT` cents everywhere; decimal strings in JSON. | §3 — legacy is integer-cents end to end; exact-match acceptance tests. |
| D2 | Legacy code values preserved verbatim; `CHECK` constraints instead of lookup tables. | Brief: keep codes unless strong reason; tiny fixed domains. |
| D3 | Account closed code = `C`; legacy never writes one. | Brief's "A/C" hint; legacy treats any non-`A` as closed. |
| D4 | Seed `transfer_id` pinned to 0,1,2 (HSQLDB identity start). | Keeps `ORDER BY crt_ts DESC, transfer_id DESC` identical; harmless otherwise. |
| D5 | Both seeded users share one bcrypt literal (cost 12). | Deterministic seed; brief asks for "the hash and the cost factor". |
| D6 | Legacy `TIMESTAMP` literals interpreted as EDT (`-04:00`) because of `-Duser.timezone=America/New_York`. | `run.sh:13`; all seed timestamps fall in Sept/Oct (daylight time). |
| D7 | Server-side Spring Session (JDBC) with 10-minute idle timeout, not JWT. | §8.3; 10 minutes is a product rule. |
| D8 | Holiday table copied as-is, including the Saturday-observance rows that deviate from Federal Reserve practice. | Legacy is the source of truth; flagged S5. |
| D9 | `UNIQUE (conf_nbr)` and FKs added although legacy lacks them. | Integrity guards that cannot change any legacy-observable happy-path behaviour. |
| D10 | Surname is **Rivera** (seed), not Reyes (README). | The app displays what the seed says. |
| D11 | `olb_confirmation_seq` kept (upsert) rather than a PostgreSQL sequence. | Exact daily-reset numbering (`-000001` each day). |
| D12 | Backend API under `/api/**`; SPA served separately. | Avoids path collisions; CSRF/session cookie scoping stays simple. |

## Appendix A — Legacy files read

`pom.xml`, `run.sh`, `README.md`, `docs/RESEARCH.md`, `src/main/resources/sql/schema.sql`, `src/main/resources/sql/seed.sql`, `src/main/resources/log4j.properties`, `src/main/resources/ApplicationResources.properties`, `src/main/webapp/WEB-INF/web.xml`, `src/main/webapp/WEB-INF/struts-config.xml`, `src/main/webapp/index.jsp`, `src/main/webapp/js/olb.js`, `src/main/webapp/WEB-INF/jsp/{transfer,confirm,error}.jsp`, `src/main/webapp/WEB-INF/jsp/inc/olbHeader.jspf`, and under `src/main/java/com/bankofamerica/olb/`: `dao/{AccountDAO,ConnectionFactory,CustomerDAO,FeeScheduleDAO,TransferDAO}.java`, `service/{AuthService,BusinessCalendar,FeeSchedule,TransferQuote,TransferService}.java`, `model/{Account,Customer,Transfer}.java`, `util/Money.java`, `web/{AuthFilter,StartupListener}.java`, `action/{BaseAction,LoginAction,LogoutAction,TransferViewAction,TransferQuoteAction,TransferSubmitAction,TransferConfirmAction}.java`, `form/*.java`.
