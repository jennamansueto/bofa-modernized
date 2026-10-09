package com.bofa.olb.domain;

import java.util.List;

/** Legacy code lists, preserved verbatim (doc 03 §2.7). */
public final class Codes {
    private Codes() {}

    public static final String TYPE_INTERNAL = "INT";
    public static final String TYPE_EXT_STANDARD = "EXS";
    public static final String TYPE_EXT_NEXT_DAY = "EXN";

    public static final String ACCT_CHECKING = "DDA";
    public static final String ACCT_SAVINGS = "SAV";
    public static final String ACCT_EXTERNAL = "EXT";

    public static final String STATUS_POSTED = "P";
    public static final String STATUS_SCHEDULED = "S";
    public static final String STATUS_REJECTED = "R";

    public static final String CUST_ACTIVE = "A";
    public static final String CUST_LOCKED = "L";

    public static final List<String> TIER_CODES = List.of("00", "10", "20", "30");
    public static final List<String> FREQUENCY_CODES = List.of("O", "W", "M");
    public static final List<String> DELIVERY_CODES = List.of("EXS", "EXN");

    public static boolean isValidTier(String code) {
        return code != null && TIER_CODES.contains(code);
    }

    public static boolean isValidFrequency(String code) {
        return code != null && FREQUENCY_CODES.contains(code);
    }

    /** Legacy R3: INT when neither side is external; otherwise EXN only when delivery == "EXN", else EXS. */
    public static String deriveType(boolean fromExternal, boolean toExternal, String delivery) {
        if (!fromExternal && !toExternal) return TYPE_INTERNAL;
        return TYPE_EXT_NEXT_DAY.equals(delivery) ? TYPE_EXT_NEXT_DAY : TYPE_EXT_STANDARD;
    }
}
