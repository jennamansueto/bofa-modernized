package com.bofa.olb.domain;

import java.time.OffsetDateTime;

public record Customer(int customerId, String userId, String passwordHash, String firstName, String lastName,
                       String tierCode, OffsetDateTime lastLogin, int failCount, String statusCode) {
    public boolean isLocked() { return Codes.CUST_LOCKED.equals(statusCode); }
}
