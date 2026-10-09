package com.bofa.olb;

import com.bofa.olb.infrastructure.config.OlbProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties(OlbProperties.class)
public class OlbApplication {
    public static void main(String[] args) {
        SpringApplication.run(OlbApplication.class, args);
    }
}
