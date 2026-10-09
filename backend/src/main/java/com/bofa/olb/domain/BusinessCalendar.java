package com.bofa.olb.domain;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.Collections;
import java.util.Set;

/**
 * Business-day arithmetic in the bank's zone (America/New_York). Port of legacy service/BusinessCalendar:
 * weekends and OLB_BANK_HOL dates are non-business days; the posting cutoff (8 PM ET) only matters for
 * same-day external requests.
 */
public final class BusinessCalendar {

    private final Set<LocalDate> holidays;
    private final int cutoffHour;
    private final Clock clock;
    private final ZoneId zone;

    public BusinessCalendar(Set<LocalDate> holidays, int cutoffHour, Clock clock, ZoneId zone) {
        this.holidays = holidays == null ? Collections.emptySet() : Set.copyOf(holidays);
        this.cutoffHour = cutoffHour;
        this.clock = clock;
        this.zone = zone;
    }

    /** Today's calendar date in the business zone. */
    public LocalDate today() {
        return LocalDate.now(clock.withZone(zone));
    }

    /** True when the current business-zone wall clock is at or past the cutoff hour. */
    public boolean isAfterCutoff() {
        return LocalTime.now(clock.withZone(zone)).getHour() >= cutoffHour;
    }

    public boolean isBusinessDay(LocalDate d) {
        DayOfWeek dow = d.getDayOfWeek();
        if (dow == DayOfWeek.SATURDAY || dow == DayOfWeek.SUNDAY) return false;
        return !holidays.contains(d);
    }

    /** d itself if it is a business day, otherwise the next business day. */
    public LocalDate rollForward(LocalDate d) {
        LocalDate x = d;
        while (!isBusinessDay(x)) x = x.plusDays(1);
        return x;
    }

    public LocalDate addBusinessDays(LocalDate d, int n) {
        LocalDate x = d;
        int added = 0;
        while (added < n) {
            x = x.plusDays(1);
            if (isBusinessDay(x)) added++;
        }
        return x;
    }

    /**
     * Effective start date for an external transfer requested on requestDate: after cutoff (same-day only)
     * the clock starts tomorrow; then roll forward to a business day.
     */
    public LocalDate effectiveStartDate(LocalDate requestDate, boolean afterCutoff) {
        LocalDate start = requestDate;
        if (afterCutoff && start.equals(today())) start = start.plusDays(1);
        return rollForward(start);
    }

    public static LocalDate firstOfMonth(LocalDate d) { return d.withDayOfMonth(1); }
    public static LocalDate firstOfNextMonth(LocalDate d) { return d.withDayOfMonth(1).plusMonths(1); }
}
