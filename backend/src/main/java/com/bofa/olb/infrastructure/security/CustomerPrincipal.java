package com.bofa.olb.infrastructure.security;

import com.bofa.olb.domain.Customer;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

import java.util.List;

/** What lives in the session: just the customer id + canonical user id (customer rows are re-read per request). */
public final class CustomerPrincipal extends AbstractAuthenticationToken {

    private final int customerId;
    private final String userId;

    public CustomerPrincipal(Customer c) {
        super(List.of(new SimpleGrantedAuthority("ROLE_CUSTOMER")));
        this.customerId = c.customerId();
        this.userId = c.userId();
        setAuthenticated(true);
    }

    public int getCustomerId() { return customerId; }
    @Override public Object getCredentials() { return null; }
    @Override public Object getPrincipal() { return userId; }
    @Override public String getName() { return userId; }
}
