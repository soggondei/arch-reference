'use client';

import { useMemo, useState } from 'react';
import type { Reference } from '@/lib/types';
import { SCHEDULE_STATUS_LABEL } from '@/lib/types';
import { buildWeeklyReport, durationLabel, shiftDate } from '@/lib/weekly-report';
import styles from './ProjectWeeklyReport.module.css';

const dayLabel = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'UTC', month: 'long', day: 'numeric', weekday: 'short',
});

type Props = {
  project: Reference;
  today: string;
  onOpenTask?: (taskId: string) => void;
};

export default function ProjectWeeklyReport({ project, today, onOpenTask }: Props) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const day = selectedDay ?? today;
  const report = useMemo(() => buildWeeklyReport(project.competitionData, day), [project.competitionData, day]);
  const { start, end, minutes, tasks, authors, days, feedback, schedule } = report;

  function taskLink(id: string, fallback: string) {
    const task = schedule.get(id);
    return task && onOpenTask
      ? <button type="button" className={styles.taskLink} onClick={() => onOpenTask(id)}>{task.taskName}</button>
      : <span>{task?.taskName ?? fallback}</span>;
  }

  return (
    <section aria-label="프로젝트 주간 리포트" className={styles.report}>
      <header className={styles.header}>
        <div>
          <h3>주간 리포트</h3>
          <p className={styles.period}>
            <time dateTime={start}>{start.replaceAll('-', '.')}</time>
            {' – '}
            <time dateTime={end}>{end.replaceAll('-', '.')}</time>
          </p>
        </div>
        <div className={styles.controls}>
          <button type="button" onClick={() => setSelectedDay(shiftDate(start, -7))}>이전 주</button>
          <button type="button" onClick={() => setSelectedDay(null)}>이번 주</button>
          <button type="button" onClick={() => setSelectedDay(shiftDate(start, 7))}>다음 주</button>
          <label>기준일 <input type="date" value={day} onChange={event => {
            const value = event.target.value;
            if (/^\d{4}-\d{2}-\d{2}$/.test(value) && event.target.validity.valid) setSelectedDay(value);
          }} /></label>
        </div>
      </header>
      <dl className={styles.totals}>
        <div><dt>총 투입시간</dt><dd>{durationLabel(minutes)}</dd></div>
        <div><dt>기록한 업무</dt><dd>{tasks.length}건</dd></div>
        <div><dt>업무일지</dt><dd>{report.logCount}건</dd></div>
        <div><dt>피드백</dt><dd>{feedback.length}건</dd></div>
      </dl>
      {report.logCount > 0 ? <>
        <div className={styles.breakdown}>
          <section>
            <h4>업무별 투입시간</h4>
            <ul>{tasks.map(group => <li key={group.key}>
              {taskLink(group.key, group.label)}<strong>{durationLabel(group.minutes)}</strong>
            </li>)}</ul>
          </section>
          <section>
            <h4>작성자별 투입시간</h4>
            <ul>{authors.map(group => <li key={group.key}>
              <span>{group.label}</span><strong>{durationLabel(group.minutes)}</strong>
            </li>)}</ul>
          </section>
        </div>
        <section className={styles.daily}>
          <h4>날짜별 업무일지</h4>
          {days.map(group => <details key={group.date}>
            <summary>
              {dayLabel.format(new Date(group.date + 'T00:00:00Z'))}
              <span>{group.logs.length}건 · {durationLabel(group.minutes)}</span>
            </summary>
            <ul>{group.logs.map(log => <li key={log.id}>
              <div className={styles.recordHead}>
                {taskLink(log.taskId, log.taskName)}
                <small>{log.author} · {durationLabel(log.minutes)}</small>
              </div>
              <p className={styles.body}>{log.body}</p>
            </li>)}</ul>
          </details>)}
        </section>
      </> : <p className={styles.empty}>이 주에 기록한 업무일지가 없습니다.</p>}
      <section className={styles.feedback}>
        <h4>이번 리포트의 피드백</h4>
        {feedback.length === 0 ? <p className={styles.empty}>이 주에 작성한 피드백이 없습니다.</p> :
          <ul>{feedback.map(entry => {
            const followUp = entry.followUpTaskId ? schedule.get(entry.followUpTaskId) : undefined;
            return <li key={entry.id}>
              <div className={styles.recordHead}>
                {taskLink(entry.taskId, entry.taskName)}
                <small>{entry.date} · {entry.author}</small>
              </div>
              <p className={styles.body}>{entry.body}</p>
              {followUp
                ? <div className={styles.action}><span>후속 업무</span> {taskLink(followUp.id, followUp.taskName)}
                  <small>현재 {SCHEDULE_STATUS_LABEL[followUp.status]}</small></div>
                : <p className={styles.meta}>{entry.followUpTaskId ? '연결했던 후속 업무가 삭제되었습니다.' : '후속 업무 미연결'}</p>}
            </li>;
          })}</ul>}
      </section>
    </section>
  );
}
