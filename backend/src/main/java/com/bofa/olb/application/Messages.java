package com.bofa.olb.application;

import org.springframework.context.MessageSource;
import org.springframework.stereotype.Component;

import java.util.Locale;

/** Legacy ApplicationResources strings (messages.properties), always rendered in en-US. */
@Component
public class Messages {

    private final MessageSource source;

    public Messages(MessageSource source) { this.source = source; }

    public String get(String key, Object... args) {
        return source.getMessage(key, args, Locale.US);
    }

    public String tierLabel(String tierCode) { return get("tier." + tierCode); }
    public String typeLabel(String typeCode) { return get("xfrtype." + typeCode); }
    public String frequencyLabel(String freqCode) { return get("freq." + freqCode); }
    public String statusLabel(String statCode) { return get("stat." + statCode); }

    /** "error.xfr.pertxn" -> "XFR_PERTXN" — stable machine-readable code for clients. */
    public static String codeFor(String messageKey) {
        String k = messageKey.startsWith("error.") ? messageKey.substring(6) : messageKey;
        return k.replace('.', '_').toUpperCase(Locale.ROOT);
    }
}
