// What's new: one entry per release a user would notice, newest first. `id` only ever grows; the app
// remembers the last one shown and, after an update, shows the newer ones once (lazy: not first paint).
export const CHANGELOG: { id: number; items: string[] }[] = [
  {
    id: 3,
    items: [
      'Calculators: 1RM table, plates per side with your own bar and plates, warm-up sets.',
      'Keep the screen on while logging (Settings).',
      'Favourite exercises (★) and recently used ones at the top of the exercise list.',
    ],
  },
  {
    id: 2,
    items: [
      'Import your history from FitNotes (Settings → Your data), and export CSV.',
      'Statistics: totals, workouts per week, categories, most trained exercises.',
      'Body tracker: weight, body fat, girths and your own measures, with graphs.',
    ],
  },
  { id: 1, items: ['Routines, supersets, copying workouts, calendar, history, graphs and records.'] },
];
export const LATEST = CHANGELOG[0].id;
