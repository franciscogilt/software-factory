package com.example;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

class CalculatorTest {
    @Test
    void adds() {
        assertEquals(5, Calculator.add(2, 3));
    }

    @Test
    void divides() {
        assertEquals(2.0, Calculator.divide(6, 3));
    }

    @Test
    void rejectsDivisionByZero() {
        assertThrows(IllegalArgumentException.class, () -> Calculator.divide(1, 0));
    }
}
