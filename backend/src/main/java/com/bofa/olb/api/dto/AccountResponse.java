package com.bofa.olb.api.dto;

import com.bofa.olb.domain.Account;
import com.bofa.olb.domain.Money;

public record AccountResponse(String accountId, String typeCode, String productName, String last4, String displayName,
                              boolean external, boolean savings, String externalBankName, int seqNo, String statusCode,
                              long currentBalanceCents, String currentBalance,
                              long availableBalanceCents, String availableBalance) {
    public static AccountResponse from(Account a) {
        return new AccountResponse(a.accountId(), a.typeCode(), a.productName(), a.last4(), a.displayName(),
                a.isExternal(), a.isSavings(), a.externalBankName(), a.seqNo(), a.statusCode(),
                a.currentBalanceCents(), Money.format(a.currentBalanceCents()),
                a.availableBalanceCents(), Money.format(a.availableBalanceCents()));
    }
}
