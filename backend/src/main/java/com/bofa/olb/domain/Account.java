package com.bofa.olb.domain;

public record Account(String accountId, int customerId, String typeCode, String productName, String last4,
                      long currentBalanceCents, long availableBalanceCents, String externalBankName, int seqNo,
                      String statusCode) {

    public boolean isExternal() { return Codes.ACCT_EXTERNAL.equals(typeCode); }
    public boolean isSavings() { return Codes.ACCT_SAVINGS.equals(typeCode); }

    /** "Advantage Plus Banking - Checking ...1001" / "JPMorgan Chase Bank, N.A. - Chase Total Checking ...4432". */
    public String displayName() {
        return displayLabel(externalBankName, productName, last4);
    }

    public static String displayLabel(String bank, String name, String last4) {
        if (name == null) return "(closed account)";
        return (bank != null ? bank + " - " : "") + name + " ..." + last4;
    }
}
