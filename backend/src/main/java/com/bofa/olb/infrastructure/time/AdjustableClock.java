package com.bofa.olb.infrastructure.time;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.concurrent.atomic.AtomicReference;

/** The application Clock: wall clock by default, pinnable (OLB_FIXED_NOW / test endpoint) for demos and tests. */
public final class AdjustableClock extends Clock {

    private final ZoneId zone;
    private final AtomicReference<Instant> fixed = new AtomicReference<>();

    public AdjustableClock(ZoneId zone) {
        this.zone = zone;
    }

    public void fix(Instant at) { fixed.set(at); }
    public void reset() { fixed.set(null); }
    public boolean isFixed() { return fixed.get() != null; }

    @Override public ZoneId getZone() { return zone; }
    @Override public Clock withZone(ZoneId z) { return z.equals(zone) ? this : new ZonedView(this, z); }
    @Override public Instant instant() {
        Instant f = fixed.get();
        return f != null ? f : Instant.now();
    }

    private static final class ZonedView extends Clock {
        private final AdjustableClock base;
        private final ZoneId zone;
        ZonedView(AdjustableClock base, ZoneId zone) { this.base = base; this.zone = zone; }
        @Override public ZoneId getZone() { return zone; }
        @Override public Clock withZone(ZoneId z) { return base.withZone(z); }
        @Override public Instant instant() { return base.instant(); }
    }
}
