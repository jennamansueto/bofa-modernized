package com.bofa.olb.api;

import com.bofa.olb.infrastructure.time.AdjustableClock;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.test.context.ActiveProfiles;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Map;

/**
 * Real HTTP against a real PostgreSQL 16 (Testcontainers). Every test starts from the exact V2 seed with the
 * application clock pinned to Friday 2026-10-09 12:00 ET (the reference "today" used throughout doc 01).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@Import(TestcontainersConfig.class)
public abstract class AbstractApiTest {

    public static final ZoneId ET = ZoneId.of("America/New_York");
    public static final LocalDateTime REFERENCE_NOW = LocalDateTime.of(2026, 10, 9, 12, 0);

    @LocalServerPort int port;
    @Autowired AdjustableClock clock;
    @Autowired DataSource dataSource;
    @Autowired JdbcClient jdbc;

    protected ApiClient api;

    @BeforeEach
    void resetState() throws SQLException {
        clock.fix(REFERENCE_NOW.atZone(ET).toInstant());
        try (Connection cn = dataSource.getConnection()) {
            cn.createStatement().execute("TRUNCATE olb_transfer, olb_confirmation_seq, olb_account, olb_customer, "
                    + "olb_fee_schedule, olb_bank_holiday RESTART IDENTITY CASCADE");
            ScriptUtils.executeSqlScript(cn, new ClassPathResource("db/migration/V2__seed.sql"));
        }
        api = new ApiClient(port);
    }

    protected void setNowEastern(LocalDateTime etLocal) {
        clock.fix(etLocal.atZone(ET).toInstant());
    }

    protected void setNow(Instant at) { clock.fix(at); }

    protected Map<String, Object> xfr(String from, String to, String amount, String tier) {
        Map<String, Object> m = new java.util.HashMap<>();
        m.put("fromAccountId", from);
        m.put("toAccountId", to);
        m.put("amount", amount);
        m.put("tierCode", tier);
        return m;
    }

    protected long availableCents(String accountId) {
        return jdbc.sql("SELECT avl_bal_cents FROM olb_account WHERE account_id = :a").param("a", accountId).query(Long.class).single();
    }

    protected long currentCents(String accountId) {
        return jdbc.sql("SELECT cur_bal_cents FROM olb_account WHERE account_id = :a").param("a", accountId).query(Long.class).single();
    }
}
