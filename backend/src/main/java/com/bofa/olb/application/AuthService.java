package com.bofa.olb.application;

import com.bofa.olb.domain.Customer;
import com.bofa.olb.infrastructure.config.OlbProperties;
import com.bofa.olb.infrastructure.persistence.CustomerRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.Optional;

/**
 * Port of legacy service/AuthService + CustomerDAO.recordLogin. Same outcomes (AC-01..AC-05), with MD5
 * replaced by BCrypt (doc 03 §6, deliberate security change).
 */
@Service
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    private final CustomerRepository customers;
    private final PasswordEncoder passwordEncoder;
    private final OlbProperties props;
    private final Clock clock;

    public AuthService(CustomerRepository customers, PasswordEncoder passwordEncoder, OlbProperties props, Clock clock) {
        this.customers = customers;
        this.passwordEncoder = passwordEncoder;
        this.props = props;
        this.clock = clock;
    }

    @Transactional(noRollbackFor = AuthenticationFailedException.class)   // the strike must persist
    public Customer authenticate(String userId, String password) {
        if (userId == null || userId.isBlank() || password == null || password.isBlank()) {
            throw new AuthenticationFailedException("error.login.required");
        }
        Optional<Customer> found = customers.findByUserId(userId.trim());
        if (found.isEmpty()) {
            // constant-time-ish: still run one bcrypt comparison so unknown users don't answer faster
            passwordEncoder.matches(password, "$2a$12$mizW3tD8IJ6jX/laR1Cr6euXdSBYdIvXf9jhmpxac22ssdhttgDAy");
            throw new AuthenticationFailedException("error.login.invalid");
        }
        Customer c = found.get();
        if (c.isLocked()) {
            throw new AuthenticationFailedException("error.login.locked");
        }
        if (!passwordEncoder.matches(password, c.passwordHash())) {
            customers.recordFailure(c.customerId(), props.lockoutThreshold());
            boolean nowLocked = c.failCount() + 1 >= props.lockoutThreshold();
            log.info("Sign-in failed for customer {} (strike {}{})", c.customerId(), c.failCount() + 1, nowLocked ? ", locked" : "");
            throw new AuthenticationFailedException(nowLocked ? "error.login.locked" : "error.login.invalid");
        }
        customers.recordSuccess(c.customerId(), OffsetDateTime.now(clock));
        return customers.findById(c.customerId()).orElse(c);
    }

    public Customer requireCustomer(int customerId) {
        return customers.findById(customerId)
                .orElseThrow(() -> new AuthenticationFailedException("error.login.invalid"));
    }
}
