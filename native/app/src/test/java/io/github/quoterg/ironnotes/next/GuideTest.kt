package io.github.quoterg.ironnotes.next

import io.github.quoterg.ironnotes.core.MuscleId
import io.github.quoterg.ironnotes.core.TrainingMode
import io.github.quoterg.ironnotes.core.WorkoutSet
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

private fun set(reps: Double? = 5.0, planned: Boolean? = null, warmup: Boolean? = null) = WorkoutSet(
    id = "s", date = "2026-11-12", exerciseId = "e", order = 1.0, weight = 80.0, reps = reps, distance = null,
    time = null, comment = null, group = null, done = null, planned = planned, rir = null, after = null, warmup = warmup,
    deload = null, sore = null, at = null,
)

class GuideTest {
    @Test fun standardAndNoRepsLogNoEffort() {
        assertNull(effortOf(Form(), true, TrainingMode.STANDARD, false))
        assertNull(effortOf(Form(), false, TrainingMode.DORIAN, false))
    }

    @Test fun dorianWorkingSetIsToFailureWithRepsAfter() {
        val f = Form().also { it.after = "3" }
        val e = effortOf(f, true, TrainingMode.DORIAN, false)!!
        assertEquals(0.0, e.rir!!, 0.0)
        assertEquals(3.0, e.after!!, 0.0)
        assertNull(e.warmup)
        assertNull(effortOf(Form(), true, TrainingMode.DORIAN, false)!!.after)
    }

    @Test fun dorianWarmupHasNoEffort() {
        val f = Form().also { it.warmup = true; it.after = "3" }
        val e = effortOf(f, true, TrainingMode.DORIAN, false)!!
        assertEquals(true, e.warmup)
        assertNull(e.rir)
        assertNull(e.after)
    }

    @Test fun dorianLighterWeekIsRir1Deload() {
        val e = effortOf(Form().also { it.after = "4" }, true, TrainingMode.DORIAN, true)!!
        assertEquals(1.0, e.rir!!, 0.0)
        assertEquals(true, e.deload)
        assertNull(e.after)
    }

    @Test fun lyleRirIsChosenAndCapped() {
        assertNull(effortOf(Form(), true, TrainingMode.LYLE, false)!!.rir)
        assertEquals(2.0, effortOf(Form().also { it.rir = "2" }, true, TrainingMode.LYLE, false)!!.rir!!, 0.0)
        assertEquals(5.0, effortOf(Form().also { it.rir = "9" }, true, TrainingMode.LYLE, false)!!.rir!!, 0.0)
    }

    @Test fun workingDoneSkipsPlannedWarmupsAndEmpty() {
        val l = listOf(set(), set(planned = true), set(warmup = true), set(reps = 0.0), set(reps = null), set())
        assertEquals(2, workingDone(l))
    }

    @Test fun muscleKeys() {
        assertEquals("mu_chest", muscleKey(MuscleId.CHEST))
        assertEquals("mu_frontDelts", muscleKey(MuscleId.FRONT_DELTS))
        assertEquals("mu_lowerBack", muscleKey(MuscleId.LOWER_BACK))
    }

    @Test fun formLoadCarriesRirOnlyAndWarmupOnlyWhenOwn() {
        val kg = defaultSettings()
        val f = Form()
        val s = set().copy(rir = 7.0, after = 2.0, warmup = null)
        f.load(s, kg, false)
        assertEquals("5", f.rir); assertEquals("", f.after); assertFalse(f.warmup)
        f.load(s, kg, true)
        assertEquals("2", f.after)
        f.load(s.copy(warmup = true), kg, true)
        assertEquals("", f.rir); assertTrue(f.warmup)
        f.load(s.copy(warmup = true), kg, false)
        assertFalse(f.warmup)
        f.load(s.copy(warmup = true, planned = true), kg, false)
        assertTrue(f.warmup)
    }
}
