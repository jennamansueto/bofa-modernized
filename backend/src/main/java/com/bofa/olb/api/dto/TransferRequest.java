package com.bofa.olb.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "Same fields as the legacy TransferForm. Values are raw strings so the legacy parsing/validation rules apply verbatim.")
public record TransferRequest(
        @Schema(example = "ACCT-1001") String fromAccountId,
        @Schema(example = "ACCT-1003") String toAccountId,
        @Schema(description = "Raw amount; '$' and ',' tolerated, max 2 decimals (AC-15)", example = "1,250.00") String amount,
        @Schema(description = "00/10/20/30. Required, no default — the submitted value is trusted (AC-20)", example = "00") String tierCode,
        @Schema(description = "EXN = next business day; anything else/absent = EXS (3 business days)", example = "EXN") String delivery,
        @Schema(description = "O/W/M; absent = O. Cosmetic in legacy (one transfer row is created)", example = "O") String frequency,
        @Schema(description = "MM/dd/yyyy (ISO yyyy-MM-dd also accepted); blank = today (ET)", example = "10/13/2026") String scheduledDate,
        @Schema(description = "Optional, max 60 chars, ignored by quote", example = "Rent") String memo) {

    public String deliveryOrDefault() { return delivery == null || delivery.isBlank() ? "EXS" : delivery; }
    public String frequencyOrDefault() { return frequency == null || frequency.isBlank() ? "O" : frequency; }
}
