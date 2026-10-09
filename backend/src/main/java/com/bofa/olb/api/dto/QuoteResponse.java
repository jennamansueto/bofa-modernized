package com.bofa.olb.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.time.LocalDate;

@Schema(description = "Legacy /secure/quote.do contract (ok, from, to, amount, fee, total, type, tier, delivery as display strings) plus structured fields.")
public record QuoteResponse(boolean ok, String from, String to, String amount, String fee, String total, String type,
                            String tier, String delivery,
                            String fromAccountId, String toAccountId, long amountCents, long feeCents, long totalCents,
                            String typeCode, String tierCode, String frequencyCode, String frequency,
                            LocalDate scheduledDate, LocalDate deliveryDate) {}
