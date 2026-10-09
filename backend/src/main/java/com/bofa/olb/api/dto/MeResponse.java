package com.bofa.olb.api.dto;

import java.time.OffsetDateTime;
import java.util.List;

public record MeResponse(int customerId, String userId, String firstName, String lastName, String displayName,
                         String tierCode, String tierLabel, List<CodeLabel> tierOptions,
                         List<CodeLabel> frequencyOptions, List<CodeLabel> deliveryOptions,
                         OffsetDateTime lastLogin, int sessionTimeoutSeconds) {}
