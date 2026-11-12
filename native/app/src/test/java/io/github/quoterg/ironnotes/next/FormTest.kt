package io.github.quoterg.ironnotes.next

import io.github.quoterg.ironnotes.core.Exercise
import io.github.quoterg.ironnotes.core.ExerciseType
import io.github.quoterg.ironnotes.core.LoadType
import io.github.quoterg.ironnotes.core.Settings
import io.github.quoterg.ironnotes.core.WeightUnit
import io.github.quoterg.ironnotes.core.WorkoutSet
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

private fun ex(kind: ExerciseType, load: LoadType? = null) = Exercise(
    id = "e", name = "X", categoryId = "c", kind = kind, notes = null, increment = null, repTop = null,
    repBottom = null, joint = null, load = load, plates = null, rest = null, favorite = null, muscles = null,
)

private fun set(weight: Double? = null, reps: Double? = null, distance: Double? = null, time: Double? = null) = WorkoutSet(
    id = "s", date = "2026-11-12", exerciseId = "e", order = 1.0, weight = weight, reps = reps, distance = distance,
    time = time, comment = null, group = null, done = null, planned = null, rir = null, after = null, warmup = null,
    deload = null, sore = null, at = null,
)

private fun i18n(lang: String) = I18n(
    en = mapOf("bwShort" to "BW", "perHandShort" to "/hand"), sv = mapOf("bwShort" to "KV", "perHandShort" to "/hand"),
    enTypes = emptyMap(), svTypes = emptyMap(), svNames = emptyMap(),
).also { it.lang = lang }

class FormTest {
    private val kg: Settings = defaultSettings()
    private val lb: Settings = kg.copy(unit = WeightUnit.LB)

    private fun form(weight: String = "", reps: String = "", min: String = "", sec: String = "") =
        Form().also { it.weight = weight; it.reps = reps; it.min = min; it.sec = sec }

    @Test fun commaAndDotParseTheSame() {
        assertEquals(82.5, parse("82,5")!!, 0.0)
        assertEquals(parse("82.5"), parse("82,5"))
        assertNull(parse(""))
        assertNull(parse("abc"))
        assertNull(parse("-1"))
    }

    @Test fun poundsAreStoredAsRoundedKilograms() {
        // The web rounds to 3 decimals (round(wFromUser(v), 3)): 135 lb = 61.2349... kg is stored as 61.235.
        val v = fromForm(form("135", "5"), ex(ExerciseType.WEIGHT_REPS), lb)!!
        assertEquals(61.235, v.weight!!, 1e-9)
        assertEquals(5.0, v.reps!!, 0.0)
    }

    @Test fun emptyWeightOnlyForBodyWeight() {
        assertNotNull(fromForm(form("", "10"), ex(ExerciseType.WEIGHT_REPS, LoadType.BODYWEIGHT), kg))
        assertNull(fromForm(form("", "10"), ex(ExerciseType.WEIGHT_REPS, LoadType.TOTAL), kg))
    }

    @Test fun zeroWeightWithRepsIsASetButZeroTimesZeroIsNot() {
        assertNotNull(fromForm(form("0", "10"), ex(ExerciseType.WEIGHT_REPS), kg))
        assertNull(fromForm(form("0", "0"), ex(ExerciseType.WEIGHT_REPS), kg))
    }

    @Test fun timeComesFromMinutesAndSeconds() {
        assertEquals(125.0, fromForm(form(min = "2", sec = "5"), ex(ExerciseType.TIME), kg)!!.time!!, 0.0)
        assertNull(fromForm(form(), ex(ExerciseType.TIME), kg))
    }

    @Test fun roundedTimeNeverShowsSixtySeconds() {
        val f = Form()
        f.load(set(time = 119.6), kg, false)
        assertEquals("2", f.min)
        assertEquals("0", f.sec)
        f.load(set(time = 125.0), kg, false)
        assertEquals("2", f.min)
        assertEquals("5", f.sec)
    }

    @Test fun loadShowsUserUnits() {
        val f = Form()
        f.load(set(weight = 61.235, reps = 5.0), lb, false)
        assertEquals("135", f.weight)
        assertEquals("5", f.reps)
    }

    @Test fun numTrimsZerosAndDnumUsesTheDecimalComma() {
        assertEquals("82.5", num(82.50))
        assertEquals("80", num(80.0))
        assertEquals("1.25", num(1.25))
        assertEquals("82.5", i18n("en").dnum(82.50))
        assertEquals("82,5", i18n("sv").dnum(82.50))
    }

    @Test fun setTextPerLoadType() {
        val en = i18n("en")
        val w = set(weight = 80.0, reps = 5.0)
        assertEquals("80 kg × 5", en.setText(w, ExerciseType.WEIGHT_REPS, kg, LoadType.TOTAL))
        assertEquals("80 kg/hand × 5", en.setText(w, ExerciseType.WEIGHT_REPS, kg, LoadType.PER_HAND))
        assertEquals("BW + 20 kg × 8", en.setText(set(weight = 20.0, reps = 8.0), ExerciseType.WEIGHT_REPS, kg, LoadType.BODYWEIGHT))
        assertEquals("BW × 8", en.setText(set(weight = 0.0, reps = 8.0), ExerciseType.WEIGHT_REPS, kg, LoadType.BODYWEIGHT))
        assertEquals("BW − 20 kg × 8", en.setText(set(weight = 20.0, reps = 8.0), ExerciseType.WEIGHT_REPS, kg, LoadType.ASSISTED))
        assertEquals("82,5 kg × 5", i18n("sv").setText(set(weight = 82.5, reps = 5.0), ExerciseType.WEIGHT_REPS, kg, LoadType.TOTAL))
    }

    @Test fun weightAndDistanceAreFormatted() {
        assertEquals("135 lb", i18n("en").weight(61.235, lb))
        assertEquals("5 km", i18n("en").distance(5.0, kg))
    }
}
