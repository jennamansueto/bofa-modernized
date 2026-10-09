package com.bofa.olb.infrastructure.persistence;

import com.bofa.olb.domain.Transfer;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public class TransferRepository {

    private static final String SELECT = """
            SELECT t.transfer_id, t.conf_nbr, t.customer_id, t.from_account_id, t.to_account_id, t.amt_cents, t.fee_cents,
                   t.xfr_typ_cd, t.rel_tier_cd, t.freq_cd, t.sched_dt, t.post_dt, t.stat_cd, t.memo, t.crt_ts,
                   fa.product_name AS f_nm, fa.acct_nbr_last4 AS f_l4, fa.ext_bank_name AS f_bank,
                   ta.product_name AS t_nm, ta.acct_nbr_last4 AS t_l4, ta.ext_bank_name AS t_bank
              FROM olb_transfer t
              LEFT JOIN olb_account fa ON fa.account_id = t.from_account_id
              LEFT JOIN olb_account ta ON ta.account_id = t.to_account_id
            """;

    private final JdbcClient jdbc;

    public TransferRepository(JdbcClient jdbc) { this.jdbc = jdbc; }

    /** Legacy TransferDAO.findRecent: ORDER BY CRT_TS DESC, XFR_ID DESC with a row limit (AC-12). */
    public List<Transfer> findRecent(int customerId, int limit) {
        return jdbc.sql(SELECT + " WHERE t.customer_id = :c ORDER BY t.crt_ts DESC, t.transfer_id DESC LIMIT :n")
                .param("c", customerId).param("n", limit).query(TransferRepository::map).list();
    }

    /** Scoped to the signed-in customer: another customer's confirmation number is simply "not found". */
    public Optional<Transfer> findByConfirmation(int customerId, String confirmation) {
        return jdbc.sql(SELECT + " WHERE t.customer_id = :c AND t.conf_nbr = :n")
                .param("c", customerId).param("n", confirmation).query(TransferRepository::map).optional();
    }

    /**
     * Legacy TransferDAO.sumExternalForDay: sum of AMT_CENTS (fees excluded) of all non-INT, non-rejected
     * transfers scheduled on the day — inbound and outbound alike.
     */
    public long sumExternalForDay(int customerId, LocalDate day) {
        return jdbc.sql("SELECT COALESCE(SUM(amt_cents), 0) FROM olb_transfer WHERE customer_id = :c "
                        + "AND xfr_typ_cd <> 'INT' AND sched_dt = :d AND stat_cd <> 'R'")
                .param("c", customerId).param("d", day).query(Long.class).single();
    }

    /** Legacy TransferDAO.countOutboundInMonth: non-rejected transfers FROM the account scheduled in [from, to). */
    public int countOutboundInMonth(String accountId, LocalDate fromInclusive, LocalDate toExclusive) {
        return jdbc.sql("SELECT COUNT(*) FROM olb_transfer WHERE from_account_id = :a AND sched_dt >= :f "
                        + "AND sched_dt < :t AND stat_cd <> 'R'")
                .param("a", accountId).param("f", fromInclusive).param("t", toExclusive).query(Integer.class).single();
    }

    /** Doc 03 §5: atomic daily counter via INSERT ... ON CONFLICT DO UPDATE ... RETURNING. */
    public int nextConfirmationSeq(LocalDate businessDate) {
        return jdbc.sql("INSERT INTO olb_confirmation_seq (seq_dt, last_seq) VALUES (:d, 1) "
                        + "ON CONFLICT (seq_dt) DO UPDATE SET last_seq = olb_confirmation_seq.last_seq + 1 RETURNING last_seq")
                .param("d", businessDate).query(Integer.class).single();
    }

    public long insert(Transfer t) {
        return jdbc.sql("""
                INSERT INTO olb_transfer (conf_nbr, customer_id, from_account_id, to_account_id, amt_cents, fee_cents,
                    xfr_typ_cd, rel_tier_cd, freq_cd, sched_dt, post_dt, stat_cd, memo, crt_ts, crt_chnl_cd)
                VALUES (:conf, :cust, :from, :to, :amt, :fee, :typ, :tier, :freq, :sched, :post, :stat, :memo, :crt, 'OLB')
                RETURNING transfer_id
                """)
                .param("conf", t.confirmationNumber()).param("cust", t.customerId())
                .param("from", t.fromAccountId()).param("to", t.toAccountId())
                .param("amt", t.amountCents()).param("fee", t.feeCents()).param("typ", t.typeCode())
                .param("tier", t.tierCode()).param("freq", t.frequencyCode()).param("sched", t.scheduledDate())
                .param("post", t.postDate()).param("stat", t.statusCode()).param("memo", t.memo())
                .param("crt", t.createdTs()).query(Long.class).single();
    }

    static Transfer map(ResultSet rs, int i) throws SQLException {
        return new Transfer(rs.getLong("transfer_id"), rs.getString("conf_nbr"), rs.getInt("customer_id"),
                rs.getString("from_account_id"), rs.getString("to_account_id"), rs.getLong("amt_cents"), rs.getLong("fee_cents"),
                rs.getString("xfr_typ_cd"), rs.getString("rel_tier_cd"), rs.getString("freq_cd"),
                rs.getObject("sched_dt", LocalDate.class), rs.getObject("post_dt", LocalDate.class),
                rs.getString("stat_cd"), rs.getString("memo"), rs.getObject("crt_ts", OffsetDateTime.class),
                com.bofa.olb.domain.Account.displayLabel(rs.getString("f_bank"), rs.getString("f_nm"), rs.getString("f_l4")),
                com.bofa.olb.domain.Account.displayLabel(rs.getString("t_bank"), rs.getString("t_nm"), rs.getString("t_l4")));
    }
}
