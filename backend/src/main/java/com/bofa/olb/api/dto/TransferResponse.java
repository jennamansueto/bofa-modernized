package com.bofa.olb.api.dto;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

public record TransferResponse(String confirmationNumber, String statusCode, String status,
                               LocalDate scheduledDate, LocalDate postDate, String delivery,
                               String from, String to, String fromAccountId, String toAccountId,
                               long amountCents, String amount, long feeCents, String fee, long totalCents, String total,
                               String typeCode, String type, String tierCode, String tier,
                               String frequencyCode, String frequency, String memo, OffsetDateTime createdTs,
                               String heading, String note, List<AccountResponse> accounts) {}
