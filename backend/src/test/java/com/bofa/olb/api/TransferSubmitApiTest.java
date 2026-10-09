package com.bofa.olb.api;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

/** POST /api/secure/transfers, GET /api/secure/transfers[/{conf}] — persistence rules R8..R10. */
class TransferSubmitApiTest extends AbstractApiTest {

    @BeforeEach
    void signIn() { api.loginDemo(); }

    ApiClient.Response submit(Map<String, Object> body) { return api.post("/api/secure/transfers", body); }

    @Test
    void AC12_historyOrderedByCreatedDescThenIdDesc_maxTen() {
        var h = api.get("/api/secure/transfers");
        assertThat(h.status()).isEqualTo(200);
        assertThat(h.body()).hasSize(3);
        assertThat(h.body().get(0).path("confirmationNumber").asText()).isEqualTo("XFR261006-000091");
        assertThat(h.body().get(0).path("status").asText()).isEqualTo("Scheduled");
        assertThat(h.body().get(0).path("postDate").asText()).isEqualTo("2026-10-09");
        assertThat(h.body().get(0).path("amount").asText()).isEqualTo("$500.00");
        assertThat(h.body().get(1).path("confirmationNumber").asText()).isEqualTo("XFR261001-000203");
        assertThat(h.body().get(1).path("amount").asText()).isEqualTo("$1,200.00");
        assertThat(h.body().get(2).path("confirmationNumber").asText()).isEqualTo("XFR260928-000014");
        assertThat(h.body().get(2).path("from").asText()).isEqualTo("Advantage Plus Banking - Checking ...1001");

        for (int i = 0; i < 12; i++) submit(xfr("ACCT-1001", "ACCT-1002", "1", "10"));
        var after = api.get("/api/secure/transfers");
        assertThat(after.body()).hasSize(10);
        assertThat(after.body().get(0).path("confirmationNumber").asText()).isEqualTo("XFR261009-000012");
        assertThat(after.body().get(9).path("confirmationNumber").asText()).isEqualTo("XFR261009-000003");
    }

    @Test
    void AC20_AC38_submittedTierFrequencyAndTrimmedMemoAreStored() {
        var body = xfr("ACCT-1001", "ACCT-1002", "25", "00");
        body.put("frequency", "W");
        body.put("memo", "  Test memo  ");
        body.put("scheduledDate", "10/20/2026");
        var r = submit(body);
        assertThat(r.status()).isEqualTo(201);
        assertThat(r.str("tier")).isEqualTo("Standard");
        assertThat(r.str("frequency")).isEqualTo("Weekly");
        assertThat(r.str("memo")).isEqualTo("Test memo");
        var row = jdbc.sql("SELECT rel_tier_cd, freq_cd, memo, crt_chnl_cd, customer_id FROM olb_transfer WHERE conf_nbr = :c")
                .param("c", r.str("confirmationNumber")).query().singleRow();
        assertThat(row.get("rel_tier_cd")).isEqualTo("00");
        assertThat(row.get("freq_cd")).isEqualTo("W");
        assertThat(row.get("memo")).isEqualTo("Test memo");
        assertThat(row.get("crt_chnl_cd")).isEqualTo("OLB");
        assertThat(row.get("customer_id")).isEqualTo(100042);
        assertThat(jdbc.sql("SELECT COUNT(*) FROM olb_transfer WHERE freq_cd = 'W'").query(Integer.class).single()).isEqualTo(1); // no recurrences

        var blank = xfr("ACCT-1001", "ACCT-1002", "1", "10");
        blank.put("memo", "   ");
        var r2 = submit(blank);
        assertThat(r2.body().has("memo")).isFalse();
        assertThat(jdbc.sql("SELECT memo FROM olb_transfer WHERE conf_nbr = :c").param("c", r2.str("confirmationNumber"))
                .query(String.class).optional()).isEmpty();
    }

    @Test
    void AC31_internalSameDayPostsImmediatelyAndMovesBothBalances() {
        var r = submit(xfr("ACCT-1001", "ACCT-1002", "1,250", "10"));
        assertThat(r.status()).isEqualTo(201);
        assertThat(r.str("statusCode")).isEqualTo("P");
        assertThat(r.str("status")).isEqualTo("Posted");
        assertThat(r.str("scheduledDate")).isEqualTo("2026-10-09");
        assertThat(r.str("postDate")).isEqualTo("2026-10-09");
        assertThat(r.str("note")).isEqualTo("Transfers between your Bank of America accounts post the same day.");
        assertThat(r.str("heading")).isEqualTo("Your transfer has been submitted");
        var accounts = r.body().path("accounts");
        assertThat(accounts.get(0).path("currentBalance").asText()).isEqualTo("$2,965.38");
        assertThat(accounts.get(0).path("availableBalance").asText()).isEqualTo("$2,965.38");
        assertThat(accounts.get(1).path("currentBalance").asText()).isEqualTo("$14,190.00");
        assertThat(accounts.get(1).path("availableBalance").asText()).isEqualTo("$14,190.00");
        assertThat(currentCents("ACCT-1001")).isEqualTo(296538);
        assertThat(availableCents("ACCT-1002")).isEqualTo(1419000);
    }

    @Test
    void AC32_futureDatedInternalIsScheduledWithoutBalanceMovement() {
        var body = xfr("ACCT-1001", "ACCT-1002", "1,250", "10");
        body.put("scheduledDate", "10/20/2026");
        var r = submit(body);
        assertThat(r.str("statusCode")).isEqualTo("S");
        assertThat(r.str("postDate")).isEqualTo("2026-10-20");
        assertThat(r.str("delivery")).isEqualTo("Tue, Oct 20, 2026");
        assertThat(currentCents("ACCT-1001")).isEqualTo(421538);
        assertThat(availableCents("ACCT-1001")).isEqualTo(421538);
        assertThat(currentCents("ACCT-1002")).isEqualTo(1294000);

        body.put("scheduledDate", "10/10/2026");                     // Saturday: INT has no business-day roll-forward
        assertThat(submit(body).str("postDate")).isEqualTo("2026-10-10");
    }

    @Test
    void AC33_AC36_externalIsAlwaysScheduledWithAvailableHold() {
        var body = xfr("ACCT-1001", "ACCT-1003", "200", "00");
        body.put("delivery", "EXN");
        var r = submit(body);
        assertThat(r.status()).isEqualTo(201);
        assertThat(r.str("statusCode")).isEqualTo("S");
        assertThat(r.str("fee")).isEqualTo("$3.00");
        assertThat(r.str("total")).isEqualTo("$203.00");
        assertThat(r.str("scheduledDate")).isEqualTo("2026-10-09");
        assertThat(r.str("postDate")).isEqualTo("2026-10-13");
        assertThat(r.str("note")).isEqualTo("External transfers are sent via ACH and will arrive on the delivery date shown.");
        assertThat(currentCents("ACCT-1001")).isEqualTo(421538);
        assertThat(availableCents("ACCT-1001")).isEqualTo(401238);     // $4,012.38 = 4,215.38 - 203.00
        assertThat(currentCents("ACCT-1003")).isZero();

        var inbound = submit(xfr("ACCT-1003", "ACCT-1001", "300", "10"));
        assertThat(inbound.str("statusCode")).isEqualTo("S");
        assertThat(inbound.str("postDate")).isEqualTo("2026-10-15");
        assertThat(currentCents("ACCT-1001")).isEqualTo(421538);       // inbound: no balance change
        assertThat(availableCents("ACCT-1001")).isEqualTo(401238);
    }

    @Test
    void AC29_earlierExternalHoldReducesAvailableCapacity() {
        submit(xfr("ACCT-1001", "ACCT-1003", "4,000", "30"));          // hold $4,000 -> available $215.38
        var r = submit(xfr("ACCT-1001", "ACCT-1002", "215.39", "10"));
        assertThat(r.status()).isEqualTo(422);
        assertThat(r.str("code")).isEqualTo("XFR_NSF");
        assertThat(submit(xfr("ACCT-1001", "ACCT-1002", "215.38", "10")).status()).isEqualTo(201);
    }

    @Test
    void AC37_confirmationNumberUsesTodaysEasternDateAndDailySequence() {
        assertThat(submit(xfr("ACCT-1001", "ACCT-1002", "1", "10")).str("confirmationNumber")).isEqualTo("XFR261009-000001");
        assertThat(submit(xfr("ACCT-1001", "ACCT-1002", "0", "10")).status()).isEqualTo(422);  // rejected: no number consumed
        var future = xfr("ACCT-1001", "ACCT-1002", "1", "10");
        future.put("scheduledDate", "12/01/2026");
        assertThat(submit(future).str("confirmationNumber")).isEqualTo("XFR261009-000002");    // today's prefix, not sched_dt
        setNowEastern(LocalDateTime.of(2026, 10, 13, 23, 30));                                  // 03:30 UTC Oct 14
        assertThat(submit(xfr("ACCT-1001", "ACCT-1002", "1", "10")).str("confirmationNumber")).isEqualTo("XFR261013-000001");
        assertThat(jdbc.sql("SELECT last_seq FROM olb_confirmation_seq WHERE seq_dt = DATE '2026-10-09'").query(Integer.class).single()).isEqualTo(2);
    }

    @Test
    void AC37_dailySequenceIsConcurrencySafe() throws Exception {
        int n = 12;
        ExecutorService pool = Executors.newFixedThreadPool(n);
        try {
            List<Callable<String>> tasks = new ArrayList<>();
            for (int i = 0; i < n; i++) {
                tasks.add(() -> {
                    ApiClient c = new ApiClient(port);
                    c.loginDemo();
                    var r = c.post("/api/secure/transfers", xfr("ACCT-1001", "ACCT-1002", "1", "10"));
                    if (r.status() != 201) throw new IllegalStateException(r.body().toString());
                    return r.str("confirmationNumber");
                });
            }
            Set<String> numbers = new java.util.HashSet<>();
            for (Future<String> f : pool.invokeAll(tasks)) numbers.add(f.get());
            assertThat(numbers).hasSize(n);
            Set<String> expected = java.util.stream.IntStream.rangeClosed(1, n)
                    .mapToObj(i -> String.format("XFR261009-%06d", i)).collect(Collectors.toSet());
            assertThat(numbers).isEqualTo(expected);
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void AC39_confirmationLookupIsScopedToSignedInCustomer() {
        var created = submit(xfr("ACCT-1001", "ACCT-1002", "42", "10"));
        String conf = created.str("confirmationNumber");
        var r = api.get("/api/secure/transfers/" + conf);
        assertThat(r.status()).isEqualTo(200);
        assertThat(r.str("amount")).isEqualTo("$42.00");
        assertThat(r.str("from")).isEqualTo("Advantage Plus Banking - Checking ...1001");
        assertThat(r.str("to")).isEqualTo("Advantage Savings ...1002");
        assertThat(api.get("/api/secure/transfers/XFR261006-000091").status()).isEqualTo(200);   // seeded

        ApiClient sam = new ApiClient(port);
        sam.login("sam.chen", "Password1");
        var other = sam.get("/api/secure/transfers/" + conf);
        assertThat(other.status()).isEqualTo(404);
        assertThat(other.str("message")).isEqualTo("We could not find that transfer.");
        assertThat(api.get("/api/secure/transfers/XFR999999-999999").status()).isEqualTo(404);
    }

    @Test
    void AC28_submitDailyLimitErrorIsValidJsonWithLegacyMessage() {
        var first = xfr("ACCT-1001", "ACCT-1003", "3,000", "00");
        assertThat(submit(first).status()).isEqualTo(201);
        var r = submit(xfr("ACCT-1002", "ACCT-1003", "600", "00"));
        assertThat(r.status()).isEqualTo(422);
        assertThat(r.str("code")).isEqualTo("XFR_DAILY");
        assertThat(r.str("message")).isEqualTo(
                "This transfer would exceed your daily external transfer limit of $3,500.00. Today's external transfers total $3,000.00.");
        assertThat(jdbc.sql("SELECT COUNT(*) FROM olb_transfer").query(Integer.class).single()).isEqualTo(4);   // 3 seeded + 1
    }

    @Test
    void AC30_regulationDCountsSubmittedTransfers() {
        var future = xfr("ACCT-1002", "ACCT-1001", "1", "10");
        future.put("scheduledDate", "10/20/2026");
        assertThat(submit(future).status()).isEqualTo(201);                                   // 2 in Oct (1 seeded)
        for (int i = 0; i < 4; i++) assertThat(submit(xfr("ACCT-1002", "ACCT-1001", "1", "10")).status()).isEqualTo(201); // 6
        var seventh = submit(xfr("ACCT-1002", "ACCT-1001", "1", "10"));
        assertThat(seventh.status()).isEqualTo(422);
        assertThat(seventh.str("code")).isEqualTo("XFR_REGD");
    }
}
