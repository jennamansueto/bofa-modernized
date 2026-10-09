package com.bofa.olb.infrastructure.persistence;

import com.bofa.olb.domain.Account;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;

@Repository
public class AccountRepository {

    private static final String COLS = "account_id, customer_id, acct_typ_cd, product_name, acct_nbr_last4, cur_bal_cents, "
            + "avl_bal_cents, ext_bank_name, seq_no, stat_cd";

    private final JdbcClient jdbc;

    public AccountRepository(JdbcClient jdbc) { this.jdbc = jdbc; }

    /** Legacy AccountDAO.findByCustomer: open accounts ordered by ACCT_SEQ. */
    public List<Account> findOpenByCustomer(int customerId) {
        return jdbc.sql("SELECT " + COLS + " FROM olb_account WHERE customer_id = :c AND stat_cd = 'A' ORDER BY seq_no")
                .param("c", customerId).query(AccountRepository::map).list();
    }

    /** Legacy AccountDAO.findById filters STAT_CD=A: a closed account is indistinguishable from a missing one (AC-18). */
    public Optional<Account> findById(String accountId) {
        return jdbc.sql("SELECT " + COLS + " FROM olb_account WHERE account_id = :id AND stat_cd = 'A'")
                .param("id", accountId).query(AccountRepository::map).optional();
    }

    /** Legacy AccountDAO.adjustBalances: independent current/available deltas in one statement. */
    public int adjustBalance(String accountId, long currentDeltaCents, long availableDeltaCents) {
        return jdbc.sql("UPDATE olb_account SET cur_bal_cents = cur_bal_cents + :c, avl_bal_cents = avl_bal_cents + :a "
                        + "WHERE account_id = :id")
                .param("c", currentDeltaCents).param("a", availableDeltaCents).param("id", accountId).update();
    }

    static Account map(ResultSet rs, int i) throws SQLException {
        return new Account(rs.getString("account_id"), rs.getInt("customer_id"), rs.getString("acct_typ_cd"),
                rs.getString("product_name"), rs.getString("acct_nbr_last4"), rs.getLong("cur_bal_cents"),
                rs.getLong("avl_bal_cents"), rs.getString("ext_bank_name"), rs.getInt("seq_no"), rs.getString("stat_cd"));
    }
}
