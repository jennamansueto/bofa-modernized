package com.bofa.olb.domain;

import java.time.LocalDate;
import java.time.OffsetDateTime;

public record Transfer(Long transferId, String confirmationNumber, int customerId, String fromAccountId,
                       String toAccountId, long amountCents, long feeCents, String typeCode, String tierCode,
                       String frequencyCode, LocalDate scheduledDate, LocalDate postDate, String statusCode,
                       String memo, OffsetDateTime createdTs, String fromDisplay, String toDisplay) {
    public long totalDebitCents() { return amountCents + feeCents; }
    public boolean isExternal() { return !Codes.TYPE_INTERNAL.equals(typeCode); }
}
