package com.bofa.olb.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

@DisplayName("Money — legacy util/Money parsing & formatting (AC-15, AC-16)")
class MoneyTest {

    @ParameterizedTest(name = "AC15 parse ''{0}'' -> {1} cents")
    @CsvSource({
            "500, 50000", "500.00, 50000", "'$1,250.00', 125000", "'1,250', 125000", "0.5, 50", "0.50, 50",
            "250., 25000", "1., 100", "'  42.42  ', 4242", "0.01, 1", "'1,2,3', 12300", "0, 0", "0.00, 0", "-5, -500",
            "9999999999999.99, 999999999999999"})
    void AC15_parseToCents_acceptsLegacyForms(String raw, long expected) {
        assertThat(Money.parseToCents(raw)).isEqualTo(expected);
    }

    @ParameterizedTest(name = "AC15 reject ''{0}''")
    @ValueSource(strings = {"abc", "12.345", "1 000", "1e3", "$", ".5", "1.2.3", "+5", "12345678901234"})
    void AC15_parseToCents_rejectsInvalid(String raw) {
        assertThat(Money.parseToCents(raw)).isNull();
    }

    @Test
    void AC15_parseToCents_blankAndNullAreNull() {
        assertThat(Money.parseToCents(null)).isNull();
        assertThat(Money.parseToCents("")).isNull();
        assertThat(Money.parseToCents("   ")).isNull();
        assertThat(Money.parseToCents("$ ,")).isNull();
    }

    @Test
    void AC11_AC12_format_usCurrencyWithGrouping() {
        assertThat(Money.format(421538)).isEqualTo("$4,215.38");
        assertThat(Money.format(1294000)).isEqualTo("$12,940.00");
        assertThat(Money.format(0)).isEqualTo("$0.00");
        assertThat(Money.format(1)).isEqualTo("$0.01");
        assertThat(Money.format(9999999)).isEqualTo("$99,999.99");
        assertThat(Money.format(-300)).isEqualTo("-$3.00");
    }
}
