package com.bofa.olb.api;

import com.bofa.olb.infrastructure.time.AdjustableClock;
import io.swagger.v3.oas.annotations.Hidden;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.Map;

/**
 * Demo/e2e only (olb.test-clock.enabled=true, never on in the default/docker profiles): put the database back to
 * the exact Flyway V2 seed so an acceptance run always starts from the legacy demo state. HTTP sessions are left
 * alone; the application clock is not changed (use /api/test/clock).
 */
@Hidden
@RestController
@RequestMapping("/api/test")
@ConditionalOnProperty(prefix = "olb.test-clock", name = "enabled", havingValue = "true")
public class TestSupportController {

    private final DataSource dataSource;
    private final AdjustableClock clock;

    public TestSupportController(DataSource dataSource, AdjustableClock clock) {
        this.dataSource = dataSource;
        this.clock = clock;
    }

    @PostMapping("/reset")
    public Map<String, Object> reset() throws SQLException {
        try (Connection cn = dataSource.getConnection()) {
            cn.createStatement().execute("TRUNCATE olb_transfer, olb_confirmation_seq, olb_account, olb_customer, "
                    + "olb_fee_schedule, olb_bank_holiday RESTART IDENTITY CASCADE");
            ScriptUtils.executeSqlScript(cn, new ClassPathResource("db/migration/V2__seed.sql"));
        }
        return Map.of("reset", true, "fixedClock", clock.isFixed(), "now", clock.instant().toString());
    }

    /**
     * Named data fixtures for criteria the seed cannot reach (doc 01 says so explicitly):
     * AC-19 needs a second linked external account; AC-21 needs a missing/not-yet-effective fee row.
     */
    @PostMapping("/fixtures/{name}")
    public Map<String, Object> fixture(@PathVariable String name) throws SQLException {
        String sql = switch (name) {
            case "second-external-account" ->
                    "INSERT INTO olb_account VALUES ('ACCT-1004', 100042, 'EXT', 'Ally Savings', '7788', 0, 0, 'Ally Bank', 4, 'A')";
            case "exn-standard-fee-row-not-effective" ->
                    "UPDATE olb_fee_schedule SET eff_dt = DATE '2099-01-01' WHERE xfr_typ_cd = 'EXN' AND rel_tier_cd = '00'";
            default -> throw new IllegalArgumentException("Unknown fixture: " + name);
        };
        try (Connection cn = dataSource.getConnection()) {
            cn.createStatement().execute(sql);
        }
        return Map.of("fixture", name, "applied", true);
    }
}
