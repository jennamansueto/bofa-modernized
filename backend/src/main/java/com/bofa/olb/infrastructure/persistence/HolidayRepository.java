package com.bofa.olb.infrastructure.persistence;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.HashSet;
import java.util.Set;

@Repository
public class HolidayRepository {

    private final JdbcClient jdbc;

    public HolidayRepository(JdbcClient jdbc) { this.jdbc = jdbc; }

    public Set<LocalDate> findAll() {
        return new HashSet<>(jdbc.sql("SELECT holiday_dt FROM olb_bank_holiday").query(LocalDate.class).list());
    }
}
