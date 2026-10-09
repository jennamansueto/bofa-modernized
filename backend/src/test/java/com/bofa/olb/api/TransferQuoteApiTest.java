package com.bofa.olb.api;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** POST /api/secure/transfers/quote — the legacy /secure/quote.do contract and rules R1..R9. */
class TransferQuoteApiTest extends AbstractApiTest {

    @BeforeEach
    void signIn() { api.loginDemo(); }

    ApiClient.Response quote(Map<String, Object> body) { return api.post("/api/secure/transfers/quote", body); }

    void assertRejected(ApiClient.Response r, String code, String message) {
        assertThat(r.status()).isEqualTo(422);
        assertThat(r.body().path("ok").asBoolean()).isFalse();
        assertThat(r.str("code")).isEqualTo(code);
        assertThat(r.str("message")).isEqualTo(message);
    }

    @Test
    void AC11_accountsAndDefaultQuoteMatchLegacyInitialState() {
        var accts = api.get("/api/secure/accounts");
        assertThat(accts.status()).isEqualTo(200);
        assertThat(accts.body()).hasSize(3);
        assertThat(accts.body().get(0).path("accountId").asText()).isEqualTo("ACCT-1001");
        assertThat(accts.body().get(0).path("currentBalance").asText()).isEqualTo("$4,215.38");
        assertThat(accts.body().get(0).path("displayName").asText()).isEqualTo("Advantage Plus Banking - Checking ...1001");
        assertThat(accts.body().get(1).path("currentBalance").asText()).isEqualTo("$12,940.00");
        assertThat(accts.body().get(1).path("displayName").asText()).isEqualTo("Advantage Savings ...1002");
        assertThat(accts.body().get(2).path("external").asBoolean()).isTrue();
        assertThat(accts.body().get(2).path("displayName").asText()).isEqualTo("JPMorgan Chase Bank, N.A. - Chase Total Checking ...4432");

        var q = quote(xfr("ACCT-1001", "ACCT-1002", "500", "10"));
        assertThat(q.status()).isEqualTo(200);
        assertThat(q.body().path("ok").asBoolean()).isTrue();
        assertThat(q.str("amount")).isEqualTo("$500.00");
        assertThat(q.str("fee")).isEqualTo("No fee");
        assertThat(q.str("total")).isEqualTo("$500.00");
        assertThat(q.str("type")).isEqualTo("Between your Bank of America accounts");
        assertThat(q.str("tier")).isEqualTo("Preferred Rewards Gold");
        assertThat(q.str("delivery")).isEqualTo("Fri, Oct 9, 2026");
    }

    @Test
    void AC14_amountRequired() {
        assertRejected(quote(xfr("ACCT-1001", "ACCT-1002", "   ", "10")), "XFR_AMOUNT_REQUIRED", "Please enter an amount.");
        assertRejected(quote(xfr("ACCT-1001", "ACCT-1002", null, "10")), "XFR_AMOUNT_REQUIRED", "Please enter an amount.");
    }

    @Test
    void AC15_amountParsing() {
        assertThat(quote(xfr("ACCT-1001", "ACCT-1002", "$1,250.5", "10")).str("amount")).isEqualTo("$1,250.50");
        assertThat(quote(xfr("ACCT-1001", "ACCT-1002", "1250.", "10")).str("amount")).isEqualTo("$1,250.00");
        for (String bad : new String[] {".50", "1.005", "abc", "1 000", "12345678901234"}) {
            assertRejected(quote(xfr("ACCT-1001", "ACCT-1002", bad, "10")), "XFR_AMOUNT_INVALID",
                    "Please enter a valid dollar amount (for example, 250.00).");
        }
    }

    @Test
    void AC16_amountAtLeastOneCent() {
        assertRejected(quote(xfr("ACCT-1001", "ACCT-1002", "0", "10")), "XFR_AMOUNT_MIN", "The transfer amount must be at least $0.01.");
        assertRejected(quote(xfr("ACCT-1001", "ACCT-1002", "-5", "10")), "XFR_AMOUNT_MIN", "The transfer amount must be at least $0.01.");
        assertThat(quote(xfr("ACCT-1001", "ACCT-1002", "0.01", "10")).status()).isEqualTo(200);
    }

    @Test
    void AC17_fromAndToMustDiffer_checkedBeforeExtToExt() {
        assertRejected(quote(xfr("ACCT-1001", "ACCT-1001", "5", "10")), "XFR_SAMEACCT", "The From and To accounts must be different.");
        assertRejected(quote(xfr("ACCT-1003", "ACCT-1003", "5", "10")), "XFR_SAMEACCT", "The From and To accounts must be different.");
    }

    @Test
    void AC18_accountsMustExistBeActiveAndBelongToCustomer() {
        String msg = "Please select valid From and To accounts.";
        assertRejected(quote(xfr("ACCT-1001", "ACCT-2001", "5", "10")), "XFR_ACCT_INVALID", msg);   // Sam Chen's
        assertRejected(quote(xfr("ACCT-1001", "ACCT-9999", "5", "10")), "XFR_ACCT_INVALID", msg);
        assertRejected(quote(xfr(null, "ACCT-1002", "5", "10")), "XFR_ACCT_INVALID", msg);
        jdbc.sql("INSERT INTO olb_account VALUES ('ACCT-1009', 100042, 'DDA', 'Old Checking', '9999', 0, 0, NULL, 9, 'C')").update();
        assertRejected(quote(xfr("ACCT-1001", "ACCT-1009", "5", "10")), "XFR_ACCT_INVALID", msg);
    }

    @Test
    void AC19_externalToExternalNotSupported() {
        jdbc.sql("INSERT INTO olb_account VALUES ('ACCT-1004', 100042, 'EXT', 'Ally Savings', '7788', 0, 0, 'Ally Bank', 4, 'A')").update();
        assertRejected(quote(xfr("ACCT-1003", "ACCT-1004", "5", "10")), "XFR_EXT2EXT",
                "Transfers between two external accounts are not supported.");
    }

    @Test
    void AC20_submittedTierOverridesStoredTier_invalidOrMissingRejected() {
        var q = quote(xfr("ACCT-1001", "ACCT-1003", "1,250.00", "00"));
        assertThat(q.str("tier")).isEqualTo("Standard");
        assertThat(q.str("tierCode")).isEqualTo("00");
        assertRejected(quote(xfr("ACCT-1001", "ACCT-1002", "5", "99")), "XFR_TIER_INVALID", "Please select a relationship tier.");
        assertRejected(quote(xfr("ACCT-1001", "ACCT-1002", "5", null)), "XFR_TIER_INVALID", "Please select a relationship tier.");
    }

    @Test
    void AC21_missingFeeRowYieldsTierMessage() {
        jdbc.sql("UPDATE olb_fee_schedule SET eff_dt = DATE '2099-01-01' WHERE xfr_typ_cd = 'EXN' AND rel_tier_cd = '00'").update();
        var body = xfr("ACCT-1001", "ACCT-1003", "100", "00");
        body.put("delivery", "EXN");
        assertRejected(quote(body), "XFR_TIER_INVALID", "Please select a relationship tier.");
    }

    @Test
    void AC22_frequencyMustBeOWM() {
        var body = xfr("ACCT-1001", "ACCT-1002", "5", "10");
        body.put("frequency", "D");
        assertRejected(quote(body), "XFR_FREQUENCY_INVALID", "Please select a frequency.");
        body.put("frequency", "W");
        assertThat(quote(body).str("frequency")).isEqualTo("Weekly");
    }

    @Test
    void AC23_scheduledDateFormatAndDefault() {
        var body = xfr("ACCT-1001", "ACCT-1002", "5", "10");
        assertThat(quote(body).str("scheduledDate")).isEqualTo("2026-10-09");          // blank -> today ET
        body.put("scheduledDate", "10/20/2026");
        assertThat(quote(body).str("scheduledDate")).isEqualTo("2026-10-20");
        for (String bad : new String[] {"10/32/2026", "10/9/26", "20-10-2026", "tomorrow"}) {
            body.put("scheduledDate", bad);
            assertRejected(quote(body), "XFR_DATE_INVALID", "Please enter the transfer date as MM/DD/YYYY.");
        }
    }

    @Test
    void AC24_scheduledDateCannotBeInPast() {
        var body = xfr("ACCT-1001", "ACCT-1002", "5", "10");
        body.put("scheduledDate", "10/08/2026");
        assertRejected(quote(body), "XFR_DATE_PAST", "The transfer date cannot be in the past.");
        body.put("scheduledDate", "10/09/2026");
        assertThat(quote(body).status()).isEqualTo(200);
        body.put("scheduledDate", "01/01/2031");
        assertThat(quote(body).status()).isEqualTo(200);                                  // no upper bound
    }

    @Test
    void AC25_typeDerivation() {
        assertThat(quote(xfr("ACCT-1001", "ACCT-1002", "5", "10")).str("typeCode")).isEqualTo("INT");
        var inbound = xfr("ACCT-1003", "ACCT-1001", "5", "10");
        inbound.put("delivery", "EXN");
        assertThat(quote(inbound).str("typeCode")).isEqualTo("EXN");
        var garbage = xfr("ACCT-1001", "ACCT-1003", "5", "10");
        garbage.put("delivery", "XYZ");
        assertThat(quote(garbage).str("type")).isEqualTo("3 business days (no fee)");
        assertThat(quote(xfr("ACCT-1001", "ACCT-1003", "5", "10")).str("typeCode")).isEqualTo("EXS");
    }

    @Test
    void AC26_feeByTypeAndTier() {
        var stdNextDay = xfr("ACCT-1001", "ACCT-1003", "1,250.00", "00");
        stdNextDay.put("delivery", "EXN");
        var q = quote(stdNextDay);
        assertThat(q.str("fee")).isEqualTo("$3.00");
        assertThat(q.str("total")).isEqualTo("$1,253.00");
        assertThat(q.num("feeCents")).isEqualTo(300);
        assertThat(q.str("type")).isEqualTo("Next business day");
        assertThat(q.str("tier")).isEqualTo("Standard");
        assertThat(q.str("delivery")).isEqualTo("Tue, Oct 13, 2026");
        assertThat(q.str("from")).isEqualTo("Advantage Plus Banking - Checking ...1001");
        assertThat(q.str("to")).isEqualTo("JPMorgan Chase Bank, N.A. - Chase Total Checking ...4432");

        var goldNextDay = xfr("ACCT-1001", "ACCT-1003", "1,250.00", "10");
        goldNextDay.put("delivery", "EXN");
        assertThat(quote(goldNextDay).str("fee")).isEqualTo("No fee");
        assertThat(quote(xfr("ACCT-1001", "ACCT-1003", "1,250.00", "00")).str("fee")).isEqualTo("No fee");
        assertThat(quote(xfr("ACCT-1001", "ACCT-1002", "1,250.00", "00")).str("fee")).isEqualTo("No fee");
    }

    @Test
    void AC27_perTransactionLimit() {
        var std = xfr("ACCT-1001", "ACCT-1003", "3,500.01", "00");
        std.put("delivery", "EXN");
        assertRejected(quote(std), "XFR_PERTXN", "This transfer exceeds the per-transfer limit of $3,500.00 for your relationship tier.");
        std.put("amount", "3,500.00");
        assertThat(quote(std).status()).isEqualTo(200);
        assertRejected(quote(xfr("ACCT-1003", "ACCT-1001", "50,000", "10")), "XFR_PERTXN",
                "This transfer exceeds the per-transfer limit of $5,000.00 for your relationship tier.");
        assertRejected(quote(xfr("ACCT-1002", "ACCT-1001", "100,000", "30")), "XFR_PERTXN",
                "This transfer exceeds the per-transfer limit of $99,999.99 for your relationship tier.");
    }

    @Test
    void AC28_dailyExternalLimit_sameDayOnly_bothDirections_validJson() {
        jdbc.sql("INSERT INTO olb_transfer (conf_nbr, customer_id, from_account_id, to_account_id, amt_cents, fee_cents, xfr_typ_cd, rel_tier_cd, freq_cd, sched_dt, post_dt, stat_cd) VALUES "
                + "('XFR261009-000001', 100042, 'ACCT-1001', 'ACCT-1003', 20000, 300, 'EXN', '00', 'O', DATE '2026-10-09', DATE '2026-10-13', 'S'),"
                + "('XFR261009-000002', 100042, 'ACCT-1003', 'ACCT-1001', 30000, 0, 'EXS', '00', 'O', DATE '2026-10-09', DATE '2026-10-15', 'S'),"
                + "('XFR261009-000003', 100042, 'ACCT-1001', 'ACCT-1003', 99900, 0, 'EXS', '00', 'O', DATE '2026-10-09', DATE '2026-10-15', 'R')").update();
        var r = quote(xfr("ACCT-1002", "ACCT-1003", "3,100", "00"));
        assertRejected(r, "XFR_DAILY",
                "This transfer would exceed your daily external transfer limit of $3,500.00. Today's external transfers total $500.00.");
        var future = xfr("ACCT-1002", "ACCT-1003", "3,100", "00");
        future.put("scheduledDate", "10/14/2026");
        assertThat(quote(future).body().path("ok").asBoolean()).isTrue();
        assertThat(quote(xfr("ACCT-1002", "ACCT-1003", "3,000", "00")).status()).isEqualTo(200);   // exactly at limit
    }

    @Test
    void AC29_amountPlusFeeWithinAvailableBalance_internalFromOnly() {
        assertThat(quote(xfr("ACCT-1001", "ACCT-1002", "4,215.38", "10")).status()).isEqualTo(200);
        assertRejected(quote(xfr("ACCT-1001", "ACCT-1002", "4,215.39", "10")), "XFR_NSF",
                "The amount plus any fee exceeds the available balance in your From account.");
        var std = xfr("ACCT-1001", "ACCT-1003", "3,000", "00");
        std.put("delivery", "EXN");
        jdbc.sql("UPDATE olb_account SET avl_bal_cents = 300200 WHERE account_id = 'ACCT-1001'").update(); // $3,002.00 available
        assertRejected(quote(std), "XFR_NSF", "The amount plus any fee exceeds the available balance in your From account.");
        assertThat(quote(xfr("ACCT-1003", "ACCT-1001", "4,999", "10")).status()).isEqualTo(200);        // external From: skipped
    }

    @Test
    void AC30_regulationD_sixOutboundPerScheduledMonthFromSavings() {
        for (int i = 1; i <= 5; i++) {
            jdbc.sql("INSERT INTO olb_transfer (conf_nbr, customer_id, from_account_id, to_account_id, amt_cents, fee_cents, xfr_typ_cd, rel_tier_cd, freq_cd, sched_dt, post_dt, stat_cd) VALUES "
                    + "('XFR261009-00000" + i + "', 100042, 'ACCT-1002', 'ACCT-1001', 100, 0, 'INT', '10', 'O', DATE '2026-10-" + (10 + i) + "', DATE '2026-10-" + (10 + i) + "', 'S')").update();
        }
        // 1 seeded (XFR261001-000203) + 5 = 6 outbound from savings in October
        assertRejected(quote(xfr("ACCT-1002", "ACCT-1001", "5", "10")), "XFR_REGD",
                "You have reached the limit of 6 transfers from your savings account this statement cycle (Regulation D).");
        var nov = xfr("ACCT-1002", "ACCT-1001", "5", "10");
        nov.put("scheduledDate", "11/02/2026");
        assertThat(quote(nov).status()).isEqualTo(200);
        assertThat(quote(xfr("ACCT-1001", "ACCT-1002", "5", "10")).status()).isEqualTo(200);   // inbound to savings doesn't count
    }

    @Test
    void AC33_externalDeliveryDates_EXS3_EXN1_businessDays() {
        var exn = xfr("ACCT-1001", "ACCT-1003", "100", "10");
        exn.put("delivery", "EXN");
        assertThat(quote(exn).str("delivery")).isEqualTo("Tue, Oct 13, 2026");
        assertThat(quote(xfr("ACCT-1001", "ACCT-1003", "100", "10")).str("delivery")).isEqualTo("Thu, Oct 15, 2026");
        exn.put("scheduledDate", "11/25/2026");
        assertThat(quote(exn).str("delivery")).isEqualTo("Fri, Nov 27, 2026");           // skips Thanksgiving
        var exs = xfr("ACCT-1001", "ACCT-1003", "100", "10");
        exs.put("scheduledDate", "10/14/2026");
        assertThat(quote(exs).str("delivery")).isEqualTo("Mon, Oct 19, 2026");
    }

    @Test
    void AC34_futureExternalOnNonBusinessDayRollsForward() {
        var exn = xfr("ACCT-1001", "ACCT-1003", "100", "10");
        exn.put("delivery", "EXN");
        exn.put("scheduledDate", "10/10/2026");
        assertThat(quote(exn).str("delivery")).isEqualTo("Wed, Oct 14, 2026");
        var exs = xfr("ACCT-1001", "ACCT-1003", "100", "10");
        exs.put("scheduledDate", "10/10/2026");
        assertThat(quote(exs).str("delivery")).isEqualTo("Fri, Oct 16, 2026");
    }

    @Test
    void AC35_eightPmEasternCutoffOnlyForSameDayExternal() {
        setNowEastern(LocalDateTime.of(2026, 10, 9, 20, 0));
        var exn = xfr("ACCT-1001", "ACCT-1003", "100", "10");
        exn.put("delivery", "EXN");
        assertThat(quote(exn).str("delivery")).isEqualTo("Wed, Oct 14, 2026");
        assertThat(quote(xfr("ACCT-1001", "ACCT-1003", "100", "10")).str("delivery")).isEqualTo("Fri, Oct 16, 2026");
        exn.put("scheduledDate", "10/14/2026");
        assertThat(quote(exn).str("delivery")).isEqualTo("Thu, Oct 15, 2026");            // future-dated: no cutoff
        assertThat(quote(xfr("ACCT-1001", "ACCT-1002", "100", "10")).str("delivery")).isEqualTo("Fri, Oct 9, 2026"); // INT unaffected
        setNowEastern(LocalDateTime.of(2026, 10, 9, 19, 59));
        assertThat(quote(xfr("ACCT-1001", "ACCT-1003", "100", "10")).str("delivery")).isEqualTo("Thu, Oct 15, 2026");
    }
}
