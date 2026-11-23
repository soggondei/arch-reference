'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Reference, WorkLog } from '@/lib/types';
import { SCHEDULE_STATUS_LABEL } from '@/lib/types';
import { buildWeeklyReport, durationLabel, shiftDate, weeklyDecisions } from '@/lib/weekly-report';
import { phaseSummary } from '@/lib/project-planning';
import { projectHref } from '@/lib/workspace-navigation';
import DrawingDetails from './DrawingDetails';
import styles from './ProjectWeeklyReport.module.css';

const dayLabel = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'UTC', month: 'long', day: 'numeric', weekday: 'short',
});

type Props = {
  project: Reference;
  today: string;
  onOpenTask?: (taskId: string) => void;
  shared: { logs: WorkLog[]; loading: boolean; error: string; retry: () => void };
};

export default function ProjectWeeklyReport({ project, today, onOpenTask, shared }: Props) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const day = selectedDay ?? today;
  const report = useMemo(() => buildWeeklyReport(project.competitionData, day, shared.logs), [project.competitionData, day, shared.logs]);
  const decisions = useMemo(() => weeklyDecisions(project.competitionData, day, today), [project.competitionData, day, today]);
  const phases = useMemo(() => project.competitionData && phaseSummary(project.competitionData, shared.logs, report.end), [project.competitionData, shared.logs, report.end]);
  const overBudget = phases?.rows.flatMap(row => row.plannedMinutes !== null && row.actualMinutes > row.plannedMinutes
    ? [{ label: row.label, planned: row.plannedMinutes, actual: row.actualMinutes }] : []) ?? [];
  const ready = !shared.loading && !shared.error;
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
      <section className={styles.decisions} aria-label="주간 점검">
        <div>
          <h4>이 주에 완료한 일</h4>
          {decisions.completed.length ? <ul>{decisions.completed.map(({ task, date }) =>
            <li key={task.id}>{taskLink(task.id, task.taskName)} <small>{date}</small></li>)}</ul>
            : <p>이 주에 완료일이 기록된 업무가 없습니다.</p>}
        </div>
        {decisions.live && <>
          <div><h4>기다리는 답변</h4>
            {decisions.waiting.length ? <ul>{decisions.waiting.map(task => <li key={task.id}>{taskLink(task.id, task.taskName)}<p>{task.waitingFor}</p></li>)}</ul> : <p>답변 대기로 표시한 업무가 없습니다.</p>}
          </div>
          <div><h4>다음 행동과 제출 일정</h4>
            {decisions.actions.length > 0 && <ul>{decisions.actions.map(task => <li key={task.id}>{taskLink(task.id, task.taskName)}<p>{task.nextAction}</p></li>)}</ul>}
            {decisions.nextDelivery && <p>다음 마감 · {taskLink(decisions.nextDelivery.id, decisions.nextDelivery.taskName)} · {decisions.nextDelivery.endDate} {decisions.nextDelivery.endTime}</p>}
            {!decisions.actions.length && !decisions.nextDelivery && <p>등록한 다음 행동이나 예정된 제출 일정이 없습니다.</p>}
          </div>
        </>}
      </section>
      {shared.loading && <p role="status" className={styles.empty}>프로젝트의 업무시간을 모으는 중입니다.</p>}
      {shared.error && <p role="alert" className={styles.empty}>{shared.error} <button type="button" className={styles.taskLink} onClick={shared.retry}>다시 불러오기</button></p>}
      {ready && <>
      <dl className={styles.totals}>
        <div><dt>총 투입시간</dt><dd>{durationLabel(minutes)}</dd></div>
        <div><dt>기록한 업무</dt><dd>{tasks.length}건</dd></div>
        <div><dt>업무일지</dt><dd>{report.logCount}건</dd></div>
        <div><dt>피드백</dt><dd>{feedback.length}건</dd></div>
      </dl>
      {phases?.hasPlan && <section className={styles.phaseReview}>
        <h4>예상시간을 넘긴 단계 <small>해당 주말까지 누적 · 현재 계획 기준</small></h4>
        {overBudget.length
          ? <ul>{overBudget.map(row =>
            <li key={row.label}>{row.label} · 예상 {durationLabel(row.planned)} / 실제 {durationLabel(row.actual)} <strong>+{durationLabel(row.actual - row.planned)}</strong></li>)}</ul>
          : <p>예상시간이 설정된 단계 중 초과한 단계가 없습니다.</p>}
        <Link className={styles.taskLink} href={projectHref(project.id, 'planning')}>단계별 시간 보기</Link>
      </section>}
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
      </>}
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
              {entry.reviewedDrawing && <DrawingDetails item={entry} field="reviewedDrawing" />}
              {entry.resultDrawing && <DrawingDetails item={entry} field="resultDrawing" />}
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
