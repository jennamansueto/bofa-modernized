package com.bofa.olb.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "Error envelope. `message` is the verbatim legacy user-facing text; `code` is stable for clients.")
public record ApiError(
        @Schema(example = "false") boolean ok,
        @Schema(example = "422") int status,
        @Schema(example = "XFR_PERTXN") String code,
        @Schema(example = "This transfer exceeds the per-transfer limit of $3,500.00 for your relationship tier.") String message) {
    public static ApiError of(int status, String code, String message) { return new ApiError(false, status, code, message); }
}
