import { buildAgenda, type AgendaSource } from '@/utils/agenda';
import { DAY_MS } from '@/utils/careHistory';

/** A fixed local "now" mid-day so day-boundary math is unambiguous. */
const NOW = new Date(2025, 5, 15, 12, 0, 0).getTime();

function row(partial: Partial<AgendaSource> & { scheduleId: string }): AgendaSource {
  return {
    plantId: 'p1',
    type: 'watering',
    nextDueAt: NOW,
    reminderEnabled: true,
    ...partial,
  };
}

describe('buildAgenda', () => {
  it('buckets tasks into overdue / due-today / upcoming', () => {
    const rows: AgendaSource[] = [
      row({ scheduleId: 'a', nextDueAt: NOW - 3 * DAY_MS }), // overdue
      row({ scheduleId: 'b', nextDueAt: NOW }), // due today
      row({ scheduleId: 'c', nextDueAt: NOW + 2 * DAY_MS }), // upcoming
      row({ scheduleId: 'd', nextDueAt: null }), // ignored
    ];
    const agenda = buildAgenda(rows, { now: NOW });
    expect(agenda.overdue.map((i) => i.scheduleId)).toEqual(['a']);
    expect(agenda.dueToday.map((i) => i.scheduleId)).toEqual(['b']);
    expect(agenda.upcoming.map((i) => i.scheduleId)).toEqual(['c']);
    expect(agenda.actionableCount).toBe(2);
  });

  it('sorts overdue most-overdue-first and computes overdue days', () => {
    const rows: AgendaSource[] = [
      row({ scheduleId: 'recent', nextDueAt: NOW - 1 * DAY_MS }),
      row({ scheduleId: 'old', nextDueAt: NOW - 5 * DAY_MS }),
    ];
    const agenda = buildAgenda(rows, { now: NOW });
    expect(agenda.overdue.map((i) => i.scheduleId)).toEqual(['old', 'recent']);
    expect(agenda.overdue[0].overdueDays).toBe(5);
    expect(agenda.overdue[1].overdueDays).toBe(1);
  });

  it('limits the upcoming look-ahead', () => {
    const rows: AgendaSource[] = Array.from({ length: 8 }, (_, i) =>
      row({ scheduleId: `u${i}`, nextDueAt: NOW + (i + 1) * DAY_MS }),
    );
    const agenda = buildAgenda(rows, { now: NOW, upcomingLimit: 3 });
    expect(agenda.upcoming).toHaveLength(3);
    expect(agenda.upcoming.map((i) => i.scheduleId)).toEqual(['u0', 'u1', 'u2']);
  });

  it('attaches a rain hint to due/overdue watering only', () => {
    const rows: AgendaSource[] = [
      row({ scheduleId: 'wOverdue', type: 'watering', nextDueAt: NOW - DAY_MS }),
      row({ scheduleId: 'wUpcoming', type: 'watering', nextDueAt: NOW + 3 * DAY_MS }),
      row({ scheduleId: 'fToday', type: 'fertilising', nextDueAt: NOW }),
    ];
    const agenda = buildAgenda(rows, { now: NOW, watering: { skipForRain: true } });
    expect(agenda.overdue[0].hint).toMatch(/rain/i);
    expect(agenda.upcoming[0].hint).toBeUndefined(); // upcoming watering: no rain nudge
    expect(agenda.dueToday[0].hint).toBeUndefined(); // fertilising: never a watering hint
  });

  it('falls back to a seasonal watering hint when there is no rain', () => {
    const rows: AgendaSource[] = [row({ scheduleId: 'w', type: 'watering', nextDueAt: NOW })];
    const winter = buildAgenda(rows, { now: NOW, watering: { season: 'winter' } });
    expect(winter.dueToday[0].hint).toMatch(/winter/i);
  });
});
