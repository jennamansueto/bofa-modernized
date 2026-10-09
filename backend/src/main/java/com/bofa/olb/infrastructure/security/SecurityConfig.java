package com.bofa.olb.infrastructure.security;

import com.bofa.olb.infrastructure.config.OlbProperties;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.www.BasicAuthenticationFilter;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

/**
 * Session-cookie security for the SPA (doc 03 §6):
 * <ul>
 *   <li>Authentication = our own {@code POST /api/login} (bcrypt + legacy 3-strike lockout); the resulting
 *       SecurityContext is stored in the HTTP session (Spring Session JDBC, 10 min inactivity).</li>
 *   <li>Unauthenticated {@code /api/secure/**} -> JSON 401 ({@link JsonAuthenticationEntryPoint}) instead of the
 *       legacy 302 to the login page.</li>
 *   <li>CSRF = cookie-to-header: readable {@code XSRF-TOKEN} cookie, {@code X-XSRF-TOKEN} request header on
 *       mutating calls. {@code /api/login} and {@code /api/logout} are exempt (no session yet / idempotent).</li>
 *   <li>Spring Security's default cache-control headers reproduce the legacy no-cache behaviour (AC-10).</li>
 * </ul>
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(12);
    }

    @Bean
    public SecurityContextRepository securityContextRepository() {
        return new HttpSessionSecurityContextRepository();
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http, SecurityContextRepository contextRepository,
                                                   JsonAuthenticationEntryPoint entryPoint,
                                                   @Qualifier("corsConfigurationSource") CorsConfigurationSource corsSource)
            throws Exception {
        CookieCsrfTokenRepository csrfRepo = CookieCsrfTokenRepository.withHttpOnlyFalse();
        csrfRepo.setCookiePath("/");
        CsrfTokenRequestAttributeHandler csrfHandler = new CsrfTokenRequestAttributeHandler();
        csrfHandler.setCsrfRequestAttributeName(null); // resolve eagerly so the cookie is always written

        http
            .cors(c -> c.configurationSource(corsSource))
            .csrf(c -> c.csrfTokenRepository(csrfRepo)
                        .csrfTokenRequestHandler(csrfHandler)
                        .ignoringRequestMatchers("/api/login", "/api/logout", "/api/test/**"))
            .addFilterAfter(new CsrfCookieFilter(), BasicAuthenticationFilter.class)
            .securityContext(sc -> sc.securityContextRepository(contextRepository))
            .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED)
                                       .sessionFixation().newSession())
            .exceptionHandling(e -> e.authenticationEntryPoint(entryPoint)
                                     .accessDeniedHandler(entryPoint))
            .authorizeHttpRequests(a -> a
                .requestMatchers("/api/secure/**").authenticated()
                .requestMatchers(HttpMethod.POST, "/api/login", "/api/logout").permitAll()
                .requestMatchers("/api/csrf", "/api/test/**").permitAll()
                .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                .requestMatchers("/actuator/health/**", "/actuator/info", "/error").permitAll()
                .requestMatchers("/api/**").denyAll()
                .anyRequest().permitAll())
            .formLogin(f -> f.disable())
            .httpBasic(b -> b.disable())
            .logout(l -> l.disable())
            .requestCache(rc -> rc.disable());
        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource(OlbProperties props) {
        CorsConfiguration cfg = new CorsConfiguration();
        cfg.setAllowedOrigins(props.cors().allowedOrigins());
        cfg.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        cfg.setAllowedHeaders(List.of("Content-Type", "X-XSRF-TOKEN", "Accept"));
        cfg.setAllowCredentials(true);
        cfg.setMaxAge(3600L);
        UrlBasedCorsConfigurationSource src = new UrlBasedCorsConfigurationSource();
        src.registerCorsConfiguration("/api/**", cfg);
        return src;
    }
}
