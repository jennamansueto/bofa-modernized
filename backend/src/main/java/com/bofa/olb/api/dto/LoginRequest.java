package com.bofa.olb.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;

public record LoginRequest(
        @Schema(example = "demo.user") String userId,
        @Schema(example = "Password1") String password,
        @Schema(description = "Legacy 'Save user ID' checkbox: sets/clears the olb_uid cookie (AC-06)", example = "true")
        Boolean saveUserId) {}
