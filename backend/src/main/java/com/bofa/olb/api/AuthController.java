package com.bofa.olb.api;

import com.bofa.olb.api.dto.ApiError;
import com.bofa.olb.api.dto.CodeLabel;
import com.bofa.olb.api.dto.LoginRequest;
import com.bofa.olb.api.dto.MeResponse;
import com.bofa.olb.application.AuthService;
import com.bofa.olb.application.Messages;
import com.bofa.olb.domain.Codes;
import com.bofa.olb.domain.Customer;
import com.bofa.olb.infrastructure.security.CustomerPrincipal;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api")
@Tag(name = "Session", description = "Sign-in / sign-out / current customer")
public class AuthController {

    /** Legacy LoginAction.COOKIE_SAVED_USER. */
    public static final String SAVED_USER_COOKIE = "olb_uid";
    private static final int SESSION_TIMEOUT_SECONDS = 600;

    private final AuthService auth;
    private final Messages messages;
    private final SecurityContextRepository contextRepository;
    private final CurrentCustomer current;

    public AuthController(AuthService auth, Messages messages, SecurityContextRepository contextRepository,
                          CurrentCustomer current) {
        this.auth = auth;
        this.messages = messages;
        this.contextRepository = contextRepository;
        this.current = current;
    }

    @Operation(summary = "Sign in", description = "Legacy /login.do. Case-insensitive user id, bcrypt password, "
            + "3-strike permanent lockout (AC-01..AC-05). A new session is created on success (fixation protection).")
    @ApiResponse(responseCode = "200", description = "Signed in; session cookie set")
    @ApiResponse(responseCode = "401", description = "LOGIN_REQUIRED / LOGIN_INVALID / LOGIN_LOCKED with the legacy message",
            content = @Content(schema = @Schema(implementation = ApiError.class)))
    @PostMapping("/login")
    public MeResponse login(@RequestBody LoginRequest body, HttpServletRequest request, HttpServletResponse response) {
        Customer c = auth.authenticate(body.userId(), body.password());

        HttpSession old = request.getSession(false);
        if (old != null) old.invalidate();
        request.getSession(true);
        SecurityContext ctx = SecurityContextHolder.createEmptyContext();
        ctx.setAuthentication(new CustomerPrincipal(c));
        SecurityContextHolder.setContext(ctx);
        contextRepository.saveContext(ctx, request, response);

        boolean save = Boolean.TRUE.equals(body.saveUserId());
        Cookie saved = new Cookie(SAVED_USER_COOKIE, save ? c.userId() : "");
        saved.setMaxAge(save ? 60 * 60 * 24 * 365 : 0);
        saved.setPath("/");
        saved.setHttpOnly(false);
        response.addCookie(saved);
        return me(c);
    }

    @Operation(summary = "Sign out", description = "Legacy /logout.do: invalidates the session; olb_uid cookie is left untouched (AC-09).")
    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletRequest request, HttpServletResponse response) {
        HttpSession s = request.getSession(false);
        if (s != null) s.invalidate();
        SecurityContextHolder.clearContext();
        Cookie gone = new Cookie("SESSION", "");
        gone.setMaxAge(0);
        gone.setPath("/");
        response.addCookie(gone);
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Current customer", description = "Name, relationship tier and the tier/frequency/delivery option lists the form needs.")
    @GetMapping("/secure/me")
    public MeResponse me() {
        return me(current.get());
    }

    @Operation(summary = "CSRF token", description = "Returns the XSRF-TOKEN value (also set as a readable cookie on every response). "
            + "Send it back as X-XSRF-TOKEN on POST/PUT/DELETE to /api/secure/**.")
    @GetMapping("/csrf")
    public Map<String, String> csrf(CsrfToken token) {
        return Map.of("headerName", token.getHeaderName(), "token", token.getToken());
    }

    private MeResponse me(Customer c) {
        return new MeResponse(c.customerId(), c.userId(), c.firstName(), c.lastName(),
                c.firstName() + " " + c.lastName(), c.tierCode(), messages.tierLabel(c.tierCode()),
                Codes.TIER_CODES.stream().map(t -> new CodeLabel(t, messages.tierLabel(t))).toList(),
                Codes.FREQUENCY_CODES.stream().map(f -> new CodeLabel(f, messages.frequencyLabel(f))).toList(),
                Codes.DELIVERY_CODES.stream().map(d -> new CodeLabel(d, messages.typeLabel(d))).toList(),
                c.lastLogin(), SESSION_TIMEOUT_SECONDS);
    }
}
