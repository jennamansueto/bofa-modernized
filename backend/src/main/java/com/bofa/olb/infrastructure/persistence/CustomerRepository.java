package com.bofa.olb.infrastructure.persistence;

import com.bofa.olb.domain.Customer;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.Optional;

@Repository
public class CustomerRepository {

    private static final String COLS = "customer_id, user_id, password_hash, first_name, last_name, rel_tier_cd, "
            + "last_login_ts, fail_cnt, stat_cd";

    private final JdbcClient jdbc;

    public CustomerRepository(JdbcClient jdbc) { this.jdbc = jdbc; }

    /** Case-insensitive user lookup (legacy: UPPER(USER_ID) = UPPER(?)). */
    public Optional<Customer> findByUserId(String userId) {
        return jdbc.sql("SELECT " + COLS + " FROM olb_customer WHERE UPPER(user_id) = UPPER(:u)")
                .param("u", userId).query(CustomerRepository::map).optional();
    }

    public Optional<Customer> findById(int customerId) {
        return jdbc.sql("SELECT " + COLS + " FROM olb_customer WHERE customer_id = :id")
                .param("id", customerId).query(CustomerRepository::map).optional();
    }

    /** Legacy CustomerDAO.recordFailure: increments FAIL_CNT and flips STAT_CD to 'L' on the threshold-th strike. */
    public void recordFailure(int customerId, int lockoutThreshold) {
        jdbc.sql("UPDATE olb_customer SET fail_cnt = fail_cnt + 1, "
                        + "stat_cd = CASE WHEN fail_cnt + 1 >= :t THEN 'L' ELSE stat_cd END WHERE customer_id = :id")
                .param("t", lockoutThreshold).param("id", customerId).update();
    }

    /** Legacy CustomerDAO.recordSuccess: reset FAIL_CNT, stamp LAST_LOGIN_TS. */
    public void recordSuccess(int customerId, OffsetDateTime at) {
        jdbc.sql("UPDATE olb_customer SET fail_cnt = 0, last_login_ts = :ts WHERE customer_id = :id")
                .param("ts", at).param("id", customerId).update();
    }

    static Customer map(ResultSet rs, int i) throws SQLException {
        return new Customer(rs.getInt("customer_id"), rs.getString("user_id"), rs.getString("password_hash"),
                rs.getString("first_name"), rs.getString("last_name"), rs.getString("rel_tier_cd"),
                rs.getObject("last_login_ts", OffsetDateTime.class), rs.getInt("fail_cnt"), rs.getString("stat_cd"));
    }
}
