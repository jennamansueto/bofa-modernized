package com.bofa.olb.infrastructure.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.ZoneId;
import java.util.List;

@ConfigurationProperties(prefix = "olb")
public record OlbProperties(ZoneId businessZone, int cutoffHour, int lockoutThreshold, int regDMonthlyLimit,
                            long internalPerTxnCapCents, int historyLimit, String fixedNow,
                            TestClock testClock, Cors cors) {
    public record TestClock(boolean enabled) {}
    public record Cors(List<String> allowedOrigins) {}
}
