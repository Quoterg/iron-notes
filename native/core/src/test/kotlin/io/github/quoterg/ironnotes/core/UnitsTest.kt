package io.github.quoterg.ironnotes.core

import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class UnitsTest {
    private fun close(a: Double, b: Double) = assertTrue(abs(a - b) < 1e-9, "$a != $b")

    @Test
    fun weightRoundTrips() {
        close(wToUser(100.0, WeightUnit.LB), 220.46226218487757)
        close(wFromUser(wToUser(82.5, WeightUnit.LB), WeightUnit.LB), 82.5)
        assertEquals(82.5, wToUser(82.5, WeightUnit.KG))
    }

    @Test
    fun distanceRoundTrips() {
        close(dToUser(5.0, DistUnit.MI), 3.106855961186669)
        assertEquals(5000.0, dToUser(5.0, DistUnit.M))
        close(dFromUser(dToUser(1.234, DistUnit.MI), DistUnit.MI), 1.234)
    }

    @Test
    fun increments() {
        assertEquals(2.5, defaultIncrement(WeightUnit.KG))
        assertEquals(5.0, defaultIncrement(WeightUnit.LB))
    }
}
