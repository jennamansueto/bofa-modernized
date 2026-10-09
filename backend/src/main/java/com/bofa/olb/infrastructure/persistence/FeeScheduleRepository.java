package com.bofa.olb.infrastructure.persistence;

import com.bofa.olb.domain.FeeEntry;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.Optional;

@Repository
public class FeeScheduleRepository {

    private final JdbcClient jdbc;

    public FeeScheduleRepository(JdbcClient jdbc) { this.jdbc = jdbc; }

    /** Legacy FeeScheduleDAO.lookup: row effective on asOf for (type, tier). */
    public Optional<FeeEntry> lookup(String typeCode, String tierCode, LocalDate asOf) {
        return jdbc.sql("SELECT fee_cents, daily_lim_cents, per_txn_lim_cents FROM olb_fee_schedule "
                        + "WHERE xfr_typ_cd = :t AND rel_tier_cd = :r AND eff_dt <= :d")
                .param("t", typeCode).param("r", tierCode).param("d", asOf)
                .query((rs, i) -> new FeeEntry(rs.getLong(1), rs.getLong(2), rs.getLong(3))).optional();
    }
}
