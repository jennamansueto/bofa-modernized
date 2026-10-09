package com.bofa.olb.api;

import com.bofa.olb.application.AuthService;
import com.bofa.olb.domain.Customer;
import com.bofa.olb.infrastructure.security.CustomerPrincipal;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

@Component
public class CurrentCustomer {

    private final AuthService auth;

    public CurrentCustomer(AuthService auth) { this.auth = auth; }

    public Customer get() {
        Authentication a = SecurityContextHolder.getContext().getAuthentication();
        if (a instanceof CustomerPrincipal p) return auth.requireCustomer(p.getCustomerId());
        throw new IllegalStateException("no authenticated customer");
    }
}
