package com.bofa.olb.api;

import com.bofa.olb.infrastructure.time.AdjustableClock;
import io.swagger.v3.oas.annotations.Hidden;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.time.ZonedDateTime;
import java.util.Map;

/** Demo/e2e only (olb.test-clock.enabled=true): pin or release the application clock at runtime. */
@Hidden
@RestController
@RequestMapping("/api/test/clock")
@ConditionalOnProperty(prefix = "olb.test-clock", name = "enabled", havingValue = "true")
public class TestClockController {

    private final AdjustableClock clock;

    public TestClockController(AdjustableClock clock) { this.clock = clock; }

    @GetMapping
    public Map<String, Object> get() {
        return Map.of("fixed", clock.isFixed(), "now", clock.instant().toString(),
                "nowEastern", ZonedDateTime.now(clock).toString());
    }

    @PostMapping
    public Map<String, Object> fix(@RequestBody Map<String, String> body) {
        clock.fix(Instant.parse(body.get("now")));
        return get();
    }

    @DeleteMapping
    public Map<String, Object> reset() {
        clock.reset();
        return get();
    }
}
