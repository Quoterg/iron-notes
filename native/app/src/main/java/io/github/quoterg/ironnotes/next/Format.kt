package io.github.quoterg.ironnotes.next

import io.github.quoterg.ironnotes.core.DistUnit
import io.github.quoterg.ironnotes.core.ExerciseType
import io.github.quoterg.ironnotes.core.LoadType
import io.github.quoterg.ironnotes.core.Settings
import io.github.quoterg.ironnotes.core.WeightUnit
import io.github.quoterg.ironnotes.core.WorkoutSet
import io.github.quoterg.ironnotes.core.dToUser
import io.github.quoterg.ironnotes.core.fmtTime
import io.github.quoterg.ironnotes.core.wToUser
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale

// Display formatting — as src/lib/units.ts and app.tsx `dayLabel`. Stored units: kg, km, seconds.

/** calc.ts `round(x, d)` (JS Math.round: halves up). */
fun roundTo(x: Double, d: Int = 2): Double {
    val f = Math.pow(10.0, d.toDouble())
    return Math.floor(x * f + 0.5) / f
}

/** units.ts `num`: a number without trailing zeros (82.5, 80, 1.25). For inputs and exports. */
fun num(x: Double, d: Int = 2): String {
    val r = roundTo(x, d)
    return if (r == Math.rint(r) && Math.abs(r) < 1e15) r.toLong().toString() else r.toBigDecimal().stripTrailingZeros().toPlainString()
}

/** units.ts `dnum`: as shown — a decimal comma in Swedish. */
fun I18n.dnum(x: Double, d: Int = 2): String = num(x, d).let { if (decimalComma) it.replace('.', ',') else it }

fun unitLabel(u: WeightUnit) = if (u == WeightUnit.LB) "lb" else "kg"
fun distLabel(u: DistUnit) = when (u) { DistUnit.MI -> "mi"; DistUnit.M -> "m"; DistUnit.KM -> "km" }

fun I18n.weight(kg: Double, s: Settings): String = "${dnum(wToUser(kg, s.unit))} ${unitLabel(s.unit)}"
fun I18n.distance(km: Double, s: Settings): String = "${dnum(dToUser(km, s.dist), if (s.dist == DistUnit.M) 0 else 2)} ${distLabel(s.dist)}"

/** The fields an exercise type records, in display order (model.ts `fieldsOf`). */
enum class Field { WEIGHT, REPS, DISTANCE, TIME }

fun fieldsOf(t: ExerciseType): List<Field> = when (t) {
    ExerciseType.WEIGHT_REPS -> listOf(Field.WEIGHT, Field.REPS)
    ExerciseType.WEIGHT_DISTANCE -> listOf(Field.WEIGHT, Field.DISTANCE)
    ExerciseType.WEIGHT_TIME -> listOf(Field.WEIGHT, Field.TIME)
    ExerciseType.REPS_DISTANCE -> listOf(Field.REPS, Field.DISTANCE)
    ExerciseType.REPS_TIME -> listOf(Field.REPS, Field.TIME)
    ExerciseType.DISTANCE_TIME -> listOf(Field.DISTANCE, Field.TIME)
    ExerciseType.WEIGHT -> listOf(Field.WEIGHT)
    ExerciseType.REPS -> listOf(Field.REPS)
    ExerciseType.DISTANCE -> listOf(Field.DISTANCE)
    ExerciseType.TIME -> listOf(Field.TIME)
}

/** The stored JSON name of a type ("weight,reps"), as the web uses for keys (type names, CSV). */
fun typeKey(t: ExerciseType): String = fieldsOf(t).joinToString(",") { it.name.lowercase() }

fun WorkoutSet.field(f: Field): Double? = when (f) {
    Field.WEIGHT -> weight
    Field.REPS -> reps
    Field.DISTANCE -> distance
    Field.TIME -> time
}

/** units.ts `setText`: "80 kg × 5", "30 kg/hand × 10", "BW + 20 kg × 8", "5 km · 25:00". */
fun I18n.setText(set: WorkoutSet, type: ExerciseType, s: Settings, load: LoadType = LoadType.TOTAL): String {
    val dash = "–"
    if (type == ExerciseType.WEIGHT_REPS) {
        val r = set.reps?.let { num(it) } ?: dash
        val w = set.weight
        return when (load) {
            LoadType.BODYWEIGHT -> "${t("bwShort")}${if (w != null && w != 0.0) " + ${weight(w, s)}" else ""} × $r"
            LoadType.ASSISTED -> "${t("bwShort")}${if (w != null && w != 0.0) " − ${weight(w, s)}" else ""} × $r"
            LoadType.PER_HAND -> "${if (w != null) weight(w, s) + t("perHandShort") else dash} × $r"
            LoadType.TOTAL -> "${if (w != null) weight(w, s) else dash} × $r"
        }
    }
    return fieldsOf(type).joinToString(" · ") { f ->
        val v = set.field(f) ?: return@joinToString dash
        when (f) {
            Field.WEIGHT -> weight(v, s)
            Field.DISTANCE -> distance(v, s)
            Field.TIME -> fmtTime(v)
            Field.REPS -> "${num(v)} reps"
        }
    }
}

// ---- Dates: local calendar days as YYYY-MM-DD ----

fun isoDate(c: Calendar): String = String.format(Locale.ROOT, "%04d-%02d-%02d", c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH))
fun today(): String = isoDate(Calendar.getInstance())
fun parseIso(d: String): Calendar = Calendar.getInstance().apply {
    clear()
    val (y, m, day) = d.split("-").map { it.toInt() }
    set(y, m - 1, day)
}

/** app.tsx `dayLabel`: Today / Yesterday / Tomorrow, else "Thu 12 Nov" in the language's format. */
fun I18n.dayLabel(d: String): String {
    val t0 = today()
    return when (d) {
        t0 -> t("today")
        io.github.quoterg.ironnotes.core.addDays(t0, -1) -> t("yesterday")
        io.github.quoterg.ironnotes.core.addDays(t0, 1) -> t("tomorrow")
        else -> SimpleDateFormat("EEE d MMM", if (lang == "sv") Locale("sv", "SE") else Locale.getDefault()).format(parseIso(d).time)
    }
}
