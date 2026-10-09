package com.bofa.olb.domain;

/** Business-rule rejection. {@code code} is the legacy message key (e.g. error.xfr.pertxn); args feed MessageFormat. */
public class TransferValidationException extends RuntimeException {
    private final String code;
    private final Object[] args;

    public TransferValidationException(String code, Object... args) {
        super(code);
        this.code = code;
        this.args = args;
    }

    public String getCode() { return code; }
    public Object[] getArgs() { return args; }
}
