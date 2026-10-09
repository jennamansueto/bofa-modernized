package com.bofa.olb.infrastructure.security;

import com.bofa.olb.application.Messages;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.csrf.CsrfException;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Replaces the legacy AuthFilter redirect with JSON. Mirrors its "expired" detection: a request that presents a
 * session id the server no longer knows gets the legacy inactivity message (AC-07/AC-08); a request with no
 * session at all is plain UNAUTHENTICATED.
 */
@Component
public class JsonAuthenticationEntryPoint implements AuthenticationEntryPoint, AccessDeniedHandler {

    public static final String CODE_SESSION_EXPIRED = "SESSION_EXPIRED";
    public static final String CODE_UNAUTHENTICATED = "UNAUTHENTICATED";
    public static final String CODE_CSRF = "CSRF_REJECTED";

    private final ObjectMapper mapper;
    private final Messages messages;

    public JsonAuthenticationEntryPoint(ObjectMapper mapper, Messages messages) {
        this.mapper = mapper;
        this.messages = messages;
    }

    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response, AuthenticationException ex)
            throws IOException {
        boolean expired = request.getRequestedSessionId() != null && !request.isRequestedSessionIdValid();
        write(response, HttpServletResponse.SC_UNAUTHORIZED,
                expired ? CODE_SESSION_EXPIRED : CODE_UNAUTHENTICATED,
                expired ? messages.get("error.session.expired") : "Please sign in to continue.");
    }

    @Override
    public void handle(HttpServletRequest request, HttpServletResponse response, AccessDeniedException ex)
            throws IOException {
        if (ex instanceof CsrfException) {
            write(response, HttpServletResponse.SC_FORBIDDEN, CODE_CSRF,
                    "Missing or invalid CSRF token. Send the XSRF-TOKEN cookie value in the X-XSRF-TOKEN header.");
        } else {
            write(response, HttpServletResponse.SC_FORBIDDEN, "FORBIDDEN", "You are not allowed to perform this action.");
        }
    }

    private void write(HttpServletResponse response, int status, String code, String message) throws IOException {
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", false);
        body.put("status", status);
        body.put("code", code);
        body.put("message", message);
        mapper.writeValue(response.getWriter(), body);
    }
}
