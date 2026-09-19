/**
 * A small month-view calendar, purely presentational — it draws the current
 * month's grid and drops a dot on any day that already appears in the
 * dashboard's own "Upcoming deadlines" list (`DashboardSummary.upcomingDeadlines`,
 * docs/phase-11-plan.md §8). It fetches nothing itself: every date it shows
 * came from the same call the deadline list next to it already made, so the
 * two can never disagree.
 */

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export interface MiniCalendarMark {
  /** Day of month (1-31) this date falls on, once matched to the
   *  component's own current month/year. */
  day: number;
  status: 'OVERDUE' | 'PENDING' | 'UPCOMING';
}

export function MiniCalendar({ dates }: { dates: { date: string; status: string }[] }) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();

  const marks = new Map<number, MiniCalendarMark['status']>();
  for (const item of dates) {
    const d = new Date(item.date);
    if (Number.isNaN(d.getTime()) || d.getFullYear() !== year || d.getMonth() !== month) continue;
    const existing = marks.get(d.getDate());
    // OVERDUE > PENDING > UPCOMING, so a day with several deadlines shows
    // the most urgent one it carries.
    const rank = { OVERDUE: 2, PENDING: 1, UPCOMING: 0 } as const;
    const incoming = (item.status in rank ? item.status : 'UPCOMING') as MiniCalendarMark['status'];
    if (!existing || rank[incoming] > rank[existing]) {
      marks.set(d.getDate(), incoming);
    }
  }

  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingBlanks = firstOfMonth.getDay();
  const todayDay = today.getDate();

  const cells: (number | null)[] = [
    ...Array(leadingBlanks).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const monthLabel = today.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  return (
    <div className="mini-calendar">
      <div className="mini-calendar__head">{monthLabel}</div>
      <div className="mini-calendar__grid mini-calendar__grid--labels">
        {WEEKDAY_LABELS.map((label, index) => (
          <span key={index}>{label}</span>
        ))}
      </div>
      <div className="mini-calendar__grid">
        {cells.map((day, index) => {
          if (day === null) return <span key={`b${index}`} />;
          const mark = marks.get(day);
          return (
            <span
              key={day}
              className={`mini-calendar__cell ${day === todayDay ? 'mini-calendar__cell--today' : ''} ${
                mark ? `mini-calendar__cell--${mark.toLowerCase()}` : ''
              }`}
            >
              {day}
            </span>
          );
        })}
      </div>
    </div>
  );
}
