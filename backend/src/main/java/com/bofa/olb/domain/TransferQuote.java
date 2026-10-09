package com.bofa.olb.domain;

import java.time.LocalDate;

/** Priced, dated preview of a transfer (legacy service/TransferQuote). */
public record TransferQuote(String typeCode, long amountCents, long feeCents, LocalDate scheduledDate,
                            LocalDate deliveryDate, String tierCode, String frequencyCode,
                            Account from, Account to) {
    public long totalDebitCents() { return amountCents + feeCents; }
    public String feeDisplay() { return feeCents == 0 ? "No fee" : Money.format(feeCents); }
    public boolean isInternal() { return Codes.TYPE_INTERNAL.equals(typeCode); }
}
