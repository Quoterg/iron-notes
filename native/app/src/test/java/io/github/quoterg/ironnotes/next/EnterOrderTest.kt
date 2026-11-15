package io.github.quoterg.ironnotes.next

import io.github.quoterg.ironnotes.core.ExerciseType
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** The exercise screen's Enter key: on to the next input, save from the last one. */
class EnterOrderTest {
    @Test fun weightThenRepsThenSave() {
        val slots = slotsOf(fieldsOf(ExerciseType.WEIGHT_REPS))
        assertEquals(listOf(Slot.WEIGHT, Slot.REPS), slots)
        assertEquals(Slot.REPS, nextSlot(slots, Slot.WEIGHT))
        assertNull(nextSlot(slots, Slot.REPS))
    }

    @Test fun timeSplitsIntoMinutesThenSeconds() {
        val slots = slotsOf(fieldsOf(ExerciseType.DISTANCE_TIME))
        assertEquals(listOf(Slot.DISTANCE, Slot.MIN, Slot.SEC), slots)
        assertEquals(Slot.MIN, nextSlot(slots, Slot.DISTANCE))
        assertEquals(Slot.SEC, nextSlot(slots, Slot.MIN))
        assertNull(nextSlot(slots, Slot.SEC))
    }

    @Test fun aSingleInputSaves() {
        val slots = slotsOf(fieldsOf(ExerciseType.REPS))
        assertNull(nextSlot(slots, Slot.REPS))
    }
}
