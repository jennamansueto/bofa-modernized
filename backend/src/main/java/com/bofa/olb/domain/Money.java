package com.bofa.olb.domain;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.NumberFormat;
import java.util.Locale;
import java.util.regex.Pattern;

/** All amounts are long cents (legacy host COMP-3 S9(13)V99). Port of legacy util/Money. */
public final class Money {

    private static final Pattern AMOUNT = Pattern.compile("-?\\d{1,13}(\\.\\d{0,2})?");

    private Money() {}

    /** "$4,215.38"; negatives render as "-$4,215.38". */
    public static String format(long cents) {
        NumberFormat nf = NumberFormat.getCurrencyInstance(Locale.US);
        String s = nf.format(BigDecimal.valueOf(cents).movePointLeft(2));
        if (s.startsWith("(") && s.endsWith(")")) {
            s = "-" + s.substring(1, s.length() - 1);
        }
        return s;
    }

    /** "500.00" without currency sign. */
    public static String formatPlain(long cents) {
        return BigDecimal.valueOf(cents).movePointLeft(2).setScale(2, RoundingMode.UNNECESSARY).toPlainString();
    }

    /** Parses "$1,250.5" -> 125050. Returns null when not a valid amount (legacy regex -?\d{1,13}(\.\d{0,2})?). */
    public static Long parseToCents(String raw) {
        if (raw == null) return null;
        String s = raw.trim().replace("$", "").replace(",", "");
        if (s.isEmpty()) return null;
        if (!AMOUNT.matcher(s).matches()) return null;
        try {
            return new BigDecimal(s).setScale(2, RoundingMode.UNNECESSARY).movePointRight(2).longValueExact();
        } catch (ArithmeticException | NumberFormatException e) {
            return null;
        }
    }
}
