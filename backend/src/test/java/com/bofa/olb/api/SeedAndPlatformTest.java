package com.bofa.olb.api;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

/** Flyway V1/V2 reproduce the legacy seed (doc 01 §1, doc 03 §4) and the platform endpoints work. */
class SeedAndPlatformTest extends AbstractApiTest {

    @Autowired PasswordEncoder encoder;

    @Test
    void SEED_customersAccountsFeesHolidaysHistory() {
        assertThat(jdbc.sql("SELECT COUNT(*) FROM olb_customer").query(Integer.class).single()).isEqualTo(2);
        assertThat(jdbc.sql("SELECT COUNT(*) FROM olb_account").query(Integer.class).single()).isEqualTo(5);
        assertThat(jdbc.sql("SELECT COUNT(*) FROM olb_fee_schedule").query(Integer.class).single()).isEqualTo(12);
        assertThat(jdbc.sql("SELECT COUNT(*) FROM olb_bank_holiday").query(Integer.class).single()).isEqualTo(22);
        assertThat(jdbc.sql("SELECT COUNT(*) FROM olb_transfer").query(Integer.class).single()).isEqualTo(3);
        assertThat(jdbc.sql("SELECT COUNT(*) FROM olb_confirmation_seq").query(Integer.class).single()).isZero();

        assertThat(jdbc.sql("SELECT cur_bal_cents FROM olb_account WHERE account_id = 'ACCT-1001'").query(Long.class).single()).isEqualTo(421538);
        assertThat(jdbc.sql("SELECT cur_bal_cents FROM olb_account WHERE account_id = 'ACCT-1002'").query(Long.class).single()).isEqualTo(1294000);
        assertThat(jdbc.sql("SELECT cur_bal_cents FROM olb_account WHERE account_id = 'ACCT-2001'").query(Long.class).single()).isEqualTo(88012);
        assertThat(jdbc.sql("SELECT cur_bal_cents FROM olb_account WHERE account_id = 'ACCT-2002'").query(Long.class).single()).isEqualTo(250000);
        assertThat(jdbc.sql("SELECT fee_cents FROM olb_fee_schedule WHERE xfr_typ_cd = 'EXN' AND rel_tier_cd = '00'").query(Long.class).single()).isEqualTo(300);
        assertThat(jdbc.sql("SELECT per_txn_lim_cents FROM olb_fee_schedule WHERE xfr_typ_cd = 'EXS' AND rel_tier_cd = '30'").query(Long.class).single()).isEqualTo(2500000);
        assertThat(jdbc.sql("SELECT holiday_name FROM olb_bank_holiday WHERE holiday_dt = DATE '2026-10-12'").query(String.class).single()).isEqualTo("Columbus Day");
        assertThat(jdbc.sql("SELECT transfer_id FROM olb_transfer WHERE conf_nbr = 'XFR261006-000091'").query(Long.class).single()).isEqualTo(2);

        String hash = jdbc.sql("SELECT password_hash FROM olb_customer WHERE user_id = 'sam.chen'").query(String.class).single();
        assertThat(hash).startsWith("$2a$12$");
        assertThat(encoder.matches("Password1", hash)).isTrue();
        assertThat(encoder.matches("password1", hash)).isFalse();
    }

    @Test
    void PLATFORM_openApiAndSwaggerAndHealthAreServed() throws Exception {
        var docs = api.get("/v3/api-docs");
        assertThat(docs.status()).isEqualTo(200);
        assertThat(docs.body().path("paths").has("/api/login")).isTrue();
        assertThat(docs.body().path("paths").has("/api/secure/transfers/quote")).isTrue();
        assertThat(docs.body().path("paths").has("/api/test/clock")).isFalse();
        Files.createDirectories(Path.of("target"));
        Files.writeString(Path.of("target", "openapi.json"), docs.body().toPrettyString() + "\n");

        assertThat(api.get("/swagger-ui/index.html").status()).isEqualTo(200);
        assertThat(api.get("/actuator/health").str("status")).isEqualTo("UP");
    }

    @Test
    void PLATFORM_testClockEndpointPinsNow() {
        var r = api.post("/api/test/clock", java.util.Map.of("now", "2026-10-09T23:30:00-04:00"));
        assertThat(r.status()).isEqualTo(200);
        assertThat(r.body().path("fixed").asBoolean()).isTrue();
        api.loginDemo();
        var q = api.post("/api/secure/transfers/quote", xfr("ACCT-1001", "ACCT-1003", "10", "10"));
        assertThat(q.str("delivery")).isEqualTo("Fri, Oct 16, 2026");                      // after cutoff on Fri
    }
}
