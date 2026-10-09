package com.bofa.olb.api;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class AuthApiTest extends AbstractApiTest {

    static final String INVALID = "The User ID or Password you entered does not match our records. Please try again.";
    static final String LOCKED = "Your account is temporarily locked after too many unsuccessful sign-in attempts. Please call 800.432.1000.";

    int failCount(String user) {
        return jdbc.sql("SELECT fail_cnt FROM olb_customer WHERE user_id = :u").param("u", user).query(Integer.class).single();
    }

    String status(String user) {
        return jdbc.sql("SELECT stat_cd FROM olb_customer WHERE user_id = :u").param("u", user).query(String.class).single();
    }

    @Test
    void AC01_successfulLoginCreatesFreshSessionAndStampsLastLogin() {
        var first = api.get("/api/csrf");                       // establishes an anonymous session
        String anonymousSession = api.cookie("SESSION");
        assertThat(first.status()).isEqualTo(200);

        var r = api.login("  DEMO.USER  ", "Password1");        // case-insensitive, trimmed user id
        assertThat(r.status()).isEqualTo(200);
        assertThat(r.str("userId")).isEqualTo("demo.user");
        assertThat(r.str("displayName")).isEqualTo("Jordan Rivera");
        assertThat(r.str("tierCode")).isEqualTo("10");
        assertThat(r.str("tierLabel")).isEqualTo("Preferred Rewards Gold");
        assertThat(r.body().path("tierOptions")).hasSize(4);
        assertThat(api.cookie("SESSION")).isNotNull().isNotEqualTo(anonymousSession);   // session fixation protection

        var ts = jdbc.sql("SELECT last_login_ts FROM olb_customer WHERE user_id = 'demo.user'").query(java.time.OffsetDateTime.class).single();
        assertThat(ts.toInstant()).isEqualTo(REFERENCE_NOW.atZone(ET).toInstant());
        assertThat(failCount("demo.user")).isZero();

        assertThat(api.get("/api/secure/me").status()).isEqualTo(200);
    }

    @Test
    void AC01_passwordIsNotTrimmedOrCaseFolded() {
        assertThat(api.login("demo.user", "Password1 ").status()).isEqualTo(401);
        assertThat(api.login("demo.user", "password1").status()).isEqualTo(401);
    }

    @Test
    void AC02_blankCredentialsRejectedWithoutLookup() {
        var r = api.login("   ", "Password1");
        assertThat(r.status()).isEqualTo(401);
        assertThat(r.str("code")).isEqualTo("LOGIN_REQUIRED");
        assertThat(r.str("message")).isEqualTo("Please enter your User ID and Password.");
        assertThat(api.login("demo.user", "").str("code")).isEqualTo("LOGIN_REQUIRED");
        assertThat(failCount("demo.user")).isZero();
    }

    @Test
    void AC03_wrongPasswordIncrementsCounter_unknownUserSameMessage() {
        var r = api.login("sam.chen", "nope");
        assertThat(r.status()).isEqualTo(401);
        assertThat(r.str("code")).isEqualTo("LOGIN_INVALID");
        assertThat(r.str("message")).isEqualTo(INVALID);
        assertThat(failCount("sam.chen")).isEqualTo(1);
        assertThat(status("sam.chen")).isEqualTo("A");

        var u = api.login("nobody", "x");
        assertThat(u.status()).isEqualTo(401);
        assertThat(u.str("message")).isEqualTo(INVALID);
    }

    @Test
    void AC04_thirdFailureLocksImmediatelyAndPermanently() {
        assertThat(api.login("sam.chen", "bad").str("code")).isEqualTo("LOGIN_INVALID");
        assertThat(api.login("sam.chen", "bad").str("code")).isEqualTo("LOGIN_INVALID");
        var third = api.login("sam.chen", "bad");
        assertThat(third.status()).isEqualTo(401);
        assertThat(third.str("code")).isEqualTo("LOGIN_LOCKED");
        assertThat(third.str("message")).isEqualTo(LOCKED);
        assertThat(failCount("sam.chen")).isEqualTo(3);
        assertThat(status("sam.chen")).isEqualTo("L");

        var correct = api.login("sam.chen", "Password1");
        assertThat(correct.status()).isEqualTo(401);
        assertThat(correct.str("message")).isEqualTo(LOCKED);
        assertThat(failCount("sam.chen")).isEqualTo(3);           // untouched once locked
    }

    @Test
    void AC05_successResetsFailureCounter() {
        api.login("demo.user", "bad");
        api.login("demo.user", "bad");
        assertThat(failCount("demo.user")).isEqualTo(2);
        assertThat(api.loginDemo().status()).isEqualTo(200);
        assertThat(failCount("demo.user")).isZero();
        api.clearCookies();
        api.login("demo.user", "bad");
        api.login("demo.user", "bad");
        assertThat(status("demo.user")).isEqualTo("A");
        assertThat(api.loginDemo().status()).isEqualTo(200);
    }

    @Test
    void AC06_saveUserIdCookie() {
        var r = api.post("/api/login", Map.of("userId", "DEMO.USER", "password", "Password1", "saveUserId", true));
        String setCookie = String.join("\n", r.headers().getOrEmpty("Set-Cookie"));
        assertThat(setCookie).contains("olb_uid=demo.user").contains("Max-Age=31536000").contains("Path=/");
        assertThat(api.cookie("olb_uid")).isEqualTo("demo.user");

        api.clearCookies();
        var r2 = api.post("/api/login", Map.of("userId", "demo.user", "password", "Password1", "saveUserId", false));
        assertThat(String.join("\n", r2.headers().getOrEmpty("Set-Cookie"))).contains("olb_uid=;").contains("Max-Age=0");
    }

    @Test
    void AC07_unauthenticatedSecureCallIsJson401() {
        var r = api.get("/api/secure/accounts");
        assertThat(r.status()).isEqualTo(401);
        assertThat(r.headers().getContentType().toString()).startsWith("application/json");
        assertThat(r.str("code")).isEqualTo("UNAUTHENTICATED");
        assertThat(r.body().path("ok").asBoolean()).isFalse();
    }

    @Test
    void AC07_AC08_staleSessionCookieGetsLegacyExpiredMessage() {
        api.setCookie("SESSION", "ZGVhZGJlZWYtZGVhZC1iZWVmLWRlYWQtYmVlZmRlYWRiZWVm");
        var r = api.get("/api/secure/me");
        assertThat(r.status()).isEqualTo(401);
        assertThat(r.str("code")).isEqualTo("SESSION_EXPIRED");
        assertThat(r.str("message")).isEqualTo("For your security, your session has ended due to inactivity. Please log in again.");
    }

    @Test
    void AC08_sessionInactivityTimeoutIsTenMinutes() {
        var me = api.loginDemo();
        assertThat(me.num("sessionTimeoutSeconds")).isEqualTo(600);
        int maxInactive = jdbc.sql("SELECT max_inactive_interval FROM spring_session ORDER BY last_access_time DESC LIMIT 1")
                .query(Integer.class).single();
        assertThat(maxInactive).isEqualTo(600);
    }

    @Test
    void AC09_logoutInvalidatesSessionAndKeepsSavedUserCookie() {
        api.post("/api/login", Map.of("userId", "demo.user", "password", "Password1", "saveUserId", true));
        String session = api.cookie("SESSION");
        var out = api.post("/api/logout", null);
        assertThat(out.status()).isEqualTo(204);
        assertThat(api.cookie("olb_uid")).isEqualTo("demo.user");

        api.setCookie("SESSION", session);
        var after = api.get("/api/secure/me");
        assertThat(after.status()).isEqualTo(401);
        assertThat(after.str("code")).isEqualTo("SESSION_EXPIRED");
    }

    @Test
    void AC10_authenticatedResponsesAreNeverCached() {
        api.loginDemo();
        var r = api.get("/api/secure/accounts");
        assertThat(r.headers().getCacheControl()).contains("no-cache").contains("no-store");
        assertThat(r.headers().getPragma()).isEqualTo("no-cache");
        assertThat(r.headers().getFirst("Expires")).isEqualTo("0");
    }

    @Test
    void CSRF_mutatingSecureCallWithoutHeaderIsRejected() {
        api.loginDemo();
        String token = api.cookie("XSRF-TOKEN");
        assertThat(token).isNotBlank();
        api.cookies.remove("XSRF-TOKEN");                     // client "forgets" to echo the token
        var r = api.post("/api/secure/transfers/quote", xfr("ACCT-1001", "ACCT-1002", "500", "10"));
        assertThat(r.status()).isEqualTo(403);
        assertThat(r.str("code")).isEqualTo("CSRF_REJECTED");
        api.setCookie("XSRF-TOKEN", token);
        assertThat(api.post("/api/secure/transfers/quote", xfr("ACCT-1001", "ACCT-1002", "500", "10")).status()).isEqualTo(200);
    }
}
