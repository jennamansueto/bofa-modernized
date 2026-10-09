package com.bofa.olb.application;

/** Sign-in rejection; code is the legacy message key (error.login.invalid / error.login.locked / error.login.required). */
public class AuthenticationFailedException extends RuntimeException {
    private final String code;

    public AuthenticationFailedException(String code) {
        super(code);
        this.code = code;
    }

    public String getCode() { return code; }
}
