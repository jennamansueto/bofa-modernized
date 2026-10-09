package com.bofa.olb.api;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {
    @Bean
    public OpenAPI openAPI() {
        return new OpenAPI().info(new Info().title("OLB Transfers API")
                .version("1.0.0")
                .description("Modernized Bank of America Online Banking Transfers API. Session-cookie auth: "
                        + "POST /api/login, then call /api/secure/** with the SESSION cookie and X-XSRF-TOKEN header "
                        + "(value of the XSRF-TOKEN cookie) on mutating requests."));
    }
}
