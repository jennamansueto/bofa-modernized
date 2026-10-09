package com.bofa.olb.domain;

import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/** Pure calendar rules (AC-23, AC-30, AC-33..AC-35) against the 22 seeded OLB_BANK_HOL dates. */
class BusinessCalendarTest {

    static final ZoneId ET = ZoneId.of("America/New_York");
    static final Set<LocalDate> HOLIDAYS = Set.of(
            LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 19), LocalDate.of(2026, 2, 16), LocalDate.of(2026, 5, 25),
            LocalDate.of(2026, 6, 19), LocalDate.of(2026, 7, 3), LocalDate.of(2026, 9, 7), LocalDate.of(2026, 10, 12),
            LocalDate.of(2026, 11, 11), LocalDate.of(2026, 11, 26), LocalDate.of(2026, 12, 25),
            LocalDate.of(2027, 1, 1), LocalDate.of(2027, 1, 18), LocalDate.of(2027, 2, 15), LocalDate.of(2027, 5, 31),
            LocalDate.of(2027, 6, 18), LocalDate.of(2027, 7, 5), LocalDate.of(2027, 9, 6), LocalDate.of(2027, 10, 11),
            LocalDate.of(2027, 11, 11), LocalDate.of(2027, 11, 25), LocalDate.of(2027, 12, 24));

    static BusinessCalendar at(String etLocal) {
        Instant i = java.time.LocalDateTime.parse(etLocal).atZone(ET).toInstant();
        return new BusinessCalendar(HOLIDAYS, 20, Clock.fixed(i, ZoneOffset.UTC), ET);
    }

    @Test
    void AC23_todayIsEasternDateEvenWhenUtcHasRolledOver() {
        // 11:30 PM ET on Oct 9 = 03:30 UTC Oct 10
        assertThat(at("2026-10-09T23:30").today()).isEqualTo(LocalDate.of(2026, 10, 9));
    }

    @Test
    void AC35_cutoffIs8pmEastern() {
        assertThat(at("2026-10-09T19:59").isAfterCutoff()).isFalse();
        assertThat(at("2026-10-09T20:00").isAfterCutoff()).isTrue();
        assertThat(at("2026-10-09T23:59").isAfterCutoff()).isTrue();
        assertThat(at("2026-10-09T00:00").isAfterCutoff()).isFalse();
    }

    @Test
    void AC33_weekendsAndHolidaysAreNotBusinessDays() {
        BusinessCalendar cal = at("2026-10-09T12:00");
        assertThat(cal.isBusinessDay(LocalDate.of(2026, 10, 9))).isTrue();   // Fri
        assertThat(cal.isBusinessDay(LocalDate.of(2026, 10, 10))).isFalse(); // Sat
        assertThat(cal.isBusinessDay(LocalDate.of(2026, 10, 11))).isFalse(); // Sun
        assertThat(cal.isBusinessDay(LocalDate.of(2026, 10, 12))).isFalse(); // Columbus Day
        assertThat(cal.isBusinessDay(LocalDate.of(2026, 10, 13))).isTrue();
        assertThat(cal.isBusinessDay(LocalDate.of(2026, 7, 3))).isFalse();   // legacy-observed July 4th (Friday)
        assertThat(cal.isBusinessDay(LocalDate.of(2027, 12, 24))).isFalse(); // legacy-observed Christmas 2027
    }

    @Test
    void AC33_exsIsThreeBusinessDaysSkippingWeekendAndColumbusDay() {
        BusinessCalendar cal = at("2026-10-09T12:00");
        LocalDate start = cal.effectiveStartDate(LocalDate.of(2026, 10, 9), false);
        assertThat(start).isEqualTo(LocalDate.of(2026, 10, 9));
        assertThat(cal.addBusinessDays(start, 3)).isEqualTo(LocalDate.of(2026, 10, 15)); // 13,14,15
        assertThat(cal.addBusinessDays(start, 1)).isEqualTo(LocalDate.of(2026, 10, 13)); // EXN
    }

    @Test
    void AC35_afterCutoffSameDayStartsTomorrow() {
        BusinessCalendar cal = at("2026-10-08T20:30"); // Thu after 8 PM
        LocalDate start = cal.effectiveStartDate(LocalDate.of(2026, 10, 8), true);
        assertThat(start).isEqualTo(LocalDate.of(2026, 10, 9));
        assertThat(cal.addBusinessDays(start, 1)).isEqualTo(LocalDate.of(2026, 10, 13));
        assertThat(cal.addBusinessDays(start, 3)).isEqualTo(LocalDate.of(2026, 10, 15));
        // not same-day: afterCutoff flag irrelevant
        assertThat(cal.effectiveStartDate(LocalDate.of(2026, 10, 14), true)).isEqualTo(LocalDate.of(2026, 10, 14));
    }

    @Test
    void AC34_futureStartOnNonBusinessDayRollsForward() {
        BusinessCalendar cal = at("2026-10-09T12:00");
        assertThat(cal.rollForward(LocalDate.of(2026, 10, 10))).isEqualTo(LocalDate.of(2026, 10, 13)); // Sat -> Tue (Mon holiday)
        assertThat(cal.effectiveStartDate(LocalDate.of(2026, 10, 12), false)).isEqualTo(LocalDate.of(2026, 10, 13));
        assertThat(cal.addBusinessDays(LocalDate.of(2026, 10, 13), 3)).isEqualTo(LocalDate.of(2026, 10, 16));
    }

    @Test
    void AC30_monthBoundsForRegD() {
        assertThat(BusinessCalendar.firstOfMonth(LocalDate.of(2026, 10, 9))).isEqualTo(LocalDate.of(2026, 10, 1));
        assertThat(BusinessCalendar.firstOfNextMonth(LocalDate.of(2026, 12, 31))).isEqualTo(LocalDate.of(2027, 1, 1));
    }
}
