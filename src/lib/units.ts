// Stored units (kg, km, s) ↔ what the user sees, and set formatting.
import { fmtTime, round } from './calc';
import { fieldsOf, type DistUnit, type ExerciseType, type Settings, type WeightUnit, type WorkoutSet } from './model';

export const KG_PER_LB = 0.45359237;
export const KM_PER_MI = 1.609344;

export const wToUser = (kg: number, u: WeightUnit): number => (u === 'lb' ? kg / KG_PER_LB : kg);
export const wFromUser = (v: number, u: WeightUnit): number => (u === 'lb' ? v * KG_PER_LB : v);
export const dToUser = (km: number, u: DistUnit): number => (u === 'mi' ? km / KM_PER_MI : u === 'm' ? km * 1000 : km);
export const dFromUser = (v: number, u: DistUnit): number => (u === 'mi' ? v * KM_PER_MI : u === 'm' ? v / 1000 : v);

/** A number without trailing zeros: 82.5, 80, 1.25. */
export const num = (x: number, d = 2): string => String(round(x, d));

export const weight = (kg: number, s: Settings): string => `${num(wToUser(kg, s.unit))} ${s.unit}`;
export const distance = (km: number, s: Settings): string => `${num(dToUser(km, s.dist), s.dist === 'm' ? 0 : 2)} ${s.dist}`;

/** Default weight step for the +/- buttons. */
export const defaultIncrement = (u: WeightUnit): number => (u === 'lb' ? 5 : 2.5);

/** One set as text: "80 kg × 5", "12 reps", "5 km · 25:00". */
export function setText(set: WorkoutSet, type: ExerciseType, s: Settings): string {
  const f = fieldsOf(type);
  const dash = '–';
  if (type === 'weight,reps') return `${set.weight != null ? weight(set.weight, s) : dash} × ${set.reps ?? dash}`;
  return f
    .map((k) => {
      const v = set[k];
      if (v == null) return dash;
      if (k === 'weight') return weight(v, s);
      if (k === 'distance') return distance(v, s);
      if (k === 'time') return fmtTime(v);
      return `${v} reps`;
    })
    .join(' · ');
}
