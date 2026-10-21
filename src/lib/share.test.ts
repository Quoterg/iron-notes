import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Exercise } from './model';
import { workoutText } from './share';

const bench: Exercise = { id: 'b', name: 'Bench Press', categoryId: 'c', type: 'weight,reps' };
const run: Exercise = { id: 'r', name: 'Running', categoryId: 'c', type: 'distance,time' };

describe('workoutText', () => {
  it('lists exercises with their sets and comments', () => {
    const text = workoutText(
      'Tue 21 Oct',
      [
        { ex: bench, sets: [{ id: '1', date: 'd', exerciseId: 'b', order: 1, weight: 80, reps: 8, comment: 'easy' }, { id: '2', date: 'd', exerciseId: 'b', order: 2, weight: 85, reps: 5 }] },
        { ex: run, sets: [{ id: '3', date: 'd', exerciseId: 'r', order: 3, distance: 5, time: 1500 }] },
      ],
      DEFAULT_SETTINGS,
      'Felt strong',
    );
    expect(text).toBe('Tue 21 Oct\nFelt strong\n\nBench Press\n  80 kg × 8 (easy)\n  85 kg × 5\n\nRunning\n  5 km · 25:00');
  });
});
