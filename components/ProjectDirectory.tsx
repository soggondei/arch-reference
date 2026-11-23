'use client';

import { useState, type MouseEvent } from 'react';
import Link from 'next/link';
import type { Reference } from '@/lib/types';
import { directoryGroupFor, projectHref, type DirectoryGroup } from '@/lib/workspace-navigation';
import { ProjectColorDot } from './ProjectColorPicker';
import styles from './ProjectDirectory.module.css';

interface Props {
  projects: Reference[];
  group: DirectoryGroup;
  onGroupChange: (group: DirectoryGroup) => void;
  onOpenProject: (id: string) => void;
  onCreateProject: () => void;
  onCreateGeneralTask: () => void;
}

const groups: Record<DirectoryGroup, string> = { active: '진행 프로젝트', completed: '완료 프로젝트' };

export default function ProjectDirectory({ projects, group, onGroupChange, onOpenProject, onCreateProject, onCreateGeneralTask }: Props) {
  const [query, setQuery] = useState('');
  const buckets: Record<DirectoryGroup, Reference[]> = { active: [], completed: [] };
  for (const project of projects) {
    const bucket = directoryGroupFor(project);
    if (bucket) buckets[bucket].push(project);
  }
  const needle = query.trim().toLocaleLowerCase('ko');
  const visible = buckets[group].filter(project => [project.title, project.competitionData?.pm ?? '']
    .some(text => text.toLocaleLowerCase('ko').includes(needle)));
  const office = projects.find(project => project.competitionData?.workspaceKind === 'office');
  function open(event: MouseEvent<HTMLAnchorElement>, id: string) {
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault(); onOpenProject(id);
  }

  return <section className={styles.directory} aria-label="프로젝트 관리 목록">
    <div className={styles.toolbar}>
      <div className={styles.groups} role="group" aria-label="프로젝트 진행 구분">
        {(['active', 'completed'] as const).map(key => <button key={key} type="button" aria-label={groups[key]}
          aria-pressed={group === key} onClick={() => onGroupChange(key)}>
          {groups[key]} <span>{buckets[key].length}</span>
        </button>)}
      </div>
      <button type="button" className={styles.primary} onClick={onCreateProject}>일반 프로젝트 추가</button>
    </div>
    <div className={styles.listHeader}>
      <h2>{groups[group]} <small>{visible.length}개</small></h2>
      <input type="search" value={query} onChange={event => setQuery(event.target.value)}
        aria-label="프로젝트 검색" placeholder="프로젝트명·PM 검색" />
    </div>
    {visible.length ? <ul className={styles.cards}>{visible.map(project => {
      const data = project.competitionData!;
      const general = data.workspaceKind === 'project';
      const closeout = data.planning?.closeouts?.find(item => item.id === data.planning?.currentCloseout);
      const status = general ? data.planning?.archived ? closeout?.outcome ?? '종료' : '진행 중' : data.status;
      const tasks = data.schedules ?? [];
      const completed = tasks.filter(task => task.status === 'done').length;
      return <li key={project.id}><a className={styles.card} aria-label={project.title + ' 열기'}
        href={projectHref(project.id, 'calendar')} onClick={event => open(event, project.id)}>
        <span className={styles.cardMeta}><span>{general ? '일반 프로젝트' : '설계공모'}</span>
          <span className={styles.status} data-active={group === 'active'}>{status}</span></span>
        <strong><ProjectColorDot project={project} />{project.title}</strong>
        <span className={styles.cardFooter}><span>업무 {tasks.length}건{completed > 0 && ' · 완료 ' + completed + '건'}</span>
          {data.pm && <span>PM {data.pm}</span>}</span>
      </a></li>;
    })}</ul> : <p className={styles.empty}>{needle ? '검색한 프로젝트가 없습니다.' : '아직 ' + groups[group] + '가 없습니다.'}</p>}
    <section className={styles.common} aria-label="사무소 공통 업무">
      <div><h2>사무소 공통 업무</h2><p>회의, 행정, 경비 정산 등 사무소 운영 업무</p></div>
      <div className={styles.commonActions}>
        {office && <Link href={projectHref(office.id, 'schedule')}>공통 업무 보기</Link>}
        <button type="button" onClick={onCreateGeneralTask}>사무소 공통 업무 추가</button>
      </div>
    </section>
  </section>;
}
