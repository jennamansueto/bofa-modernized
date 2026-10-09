package com.bofa.olb.domain;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

class CodesTest {

    @ParameterizedTest(name = "AC25 type(fromExt={0}, toExt={1}, delivery={2}) = {3}")
    @CsvSource({
            "false, false, EXS, INT", "false, false, EXN, INT",
            "false, true, EXS, EXS", "false, true, EXN, EXN", "true, false, EXN, EXN", "true, false, EXS, EXS",
            "false, true, , EXS", "false, true, bogus, EXS", "false, true, exn, EXS"})
    void AC25_deriveType_externalEitherSideAndDeliverySelector(boolean fromExt, boolean toExt, String delivery,
                                                                     String expected) {
        assertThat(Codes.deriveType(fromExt, toExt, delivery)).isEqualTo(expected);
    }

    @ParameterizedTest
    @ValueSource(strings = {"00", "10", "20", "30"})
    void AC20_validTiers(String tier) {
        assertThat(Codes.isValidTier(tier)).isTrue();
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"99", "", "0", "Gold", "40"})
    void AC20_invalidTiers(String tier) {
        assertThat(Codes.isValidTier(tier)).isFalse();
    }

    @Test
    void AC22_frequencyCodes() {
        assertThat(Codes.isValidFrequency("O")).isTrue();
        assertThat(Codes.isValidFrequency("W")).isTrue();
        assertThat(Codes.isValidFrequency("M")).isTrue();
        assertThat(Codes.isValidFrequency("D")).isFalse();
        assertThat(Codes.isValidFrequency(null)).isFalse();
    }
}
