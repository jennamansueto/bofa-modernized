package com.bofa.olb.infrastructure.time;

import com.bofa.olb.infrastructure.config.OlbProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;

@Configuration
public class ClockConfig {

    private static final Logger log = LoggerFactory.getLogger(ClockConfig.class);

    @Bean
    public AdjustableClock adjustableClock(OlbProperties props) {
        AdjustableClock clock = new AdjustableClock(props.businessZone());
        String fixedNow = props.fixedNow();
        if (fixedNow != null && !fixedNow.isBlank()) {
            clock.fix(parseFixedNow(fixedNow.trim(), props));
            log.warn("OLB_FIXED_NOW is set: application clock pinned to {}", clock.instant());
        }
        return clock;
    }

    @Bean
    public Clock clock(AdjustableClock adjustableClock) {
        return adjustableClock;
    }

    /** Accepts an ISO instant ("2026-10-09T16:00:00Z") or an ET local date-time ("2026-10-09T12:00"). */
    static Instant parseFixedNow(String value, OlbProperties props) {
        try {
            return Instant.parse(value);
        } catch (DateTimeParseException e) {
            return LocalDateTime.parse(value).atZone(props.businessZone()).toInstant();
        }
    }
}
