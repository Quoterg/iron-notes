package io.github.quoterg.ironnotes.core

// Stored units (kg, km, s) ↔ what the user sees — as src/lib/units.ts. Convert only for display.

const val KG_PER_LB = 0.45359237
const val KM_PER_MI = 1.609344

enum class WeightUnit { KG, LB }
enum class DistUnit { KM, MI, M }

fun wToUser(kg: Double, u: WeightUnit): Double = if (u == WeightUnit.LB) kg / KG_PER_LB else kg
fun wFromUser(v: Double, u: WeightUnit): Double = if (u == WeightUnit.LB) v * KG_PER_LB else v

fun dToUser(km: Double, u: DistUnit): Double = when (u) {
    DistUnit.MI -> km / KM_PER_MI
    DistUnit.M -> km * 1000
    DistUnit.KM -> km
}

fun dFromUser(v: Double, u: DistUnit): Double = when (u) {
    DistUnit.MI -> v * KM_PER_MI
    DistUnit.M -> v / 1000
    DistUnit.KM -> v
}

/** Default weight step for the +/- buttons. */
fun defaultIncrement(u: WeightUnit): Double = if (u == WeightUnit.LB) 5.0 else 2.5
