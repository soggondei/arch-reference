'use client';

import { useState, type KeyboardEvent, type MouseEvent } from 'react';
import Link from 'next/link';
import type { Reference } from '@/lib/types';
import { directoryGroupFor, directoryGroups, directoryLabels, projectHref, projectStatusLabel, type DirectoryGroup } from '@/lib/workspace-navigation';
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

export default function ProjectDirectory({ projects, group, onGroupChange, onOpenProject, onCreateProject, onCreateGeneralTask }: Props) {
  const [query, setQuery] = useState('');
  const buckets: Record<DirectoryGroup, Reference[]> = { active: [], candidate: [], completed: [], dropped: [] };
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
  function switchTab(event: KeyboardEvent<HTMLButtonElement>, key: DirectoryGroup) {
    const index = directoryGroups.indexOf(key);
    const keys: Partial<Record<string, number>> = {
      ArrowRight: (index + 1) % directoryGroups.length,
      ArrowLeft: (index + directoryGroups.length - 1) % directoryGroups.length,
      Home: 0, End: directoryGroups.length - 1,
    };
    const target = keys[event.key];
    if (target === undefined) return;
    event.preventDefault();
    const next = directoryGroups[target];
    document.getElementById('project-tab-' + next)?.focus();
    onGroupChange(next);
  }

  return <section className={styles.directory} aria-label="프로젝트 관리 목록">
    <div className={styles.toolbar}>
      <div className={styles.groups} role="tablist" aria-label="프로젝트 진행 구분">
        {directoryGroups.map(key => <button key={key} type="button" role="tab" aria-label={directoryLabels[key]}
          id={'project-tab-' + key} aria-controls="project-list-panel" aria-selected={group === key}
          tabIndex={group === key ? 0 : -1} onKeyDown={event => switchTab(event, key)} onClick={() => onGroupChange(key)}>
          {directoryLabels[key]} <span>{buckets[key].length}</span>
        </button>)}
      </div>
      <button type="button" className={styles.primary} onClick={onCreateProject}>일반 프로젝트 추가</button>
    </div>
    <div id="project-list-panel" role="tabpanel" aria-labelledby={'project-tab-' + group}>
    <div className={styles.listHeader}>
      <h2>{directoryLabels[group]} <small>{visible.length}개</small></h2>
      <input type="search" value={query} onChange={event => setQuery(event.target.value)}
        aria-label="프로젝트 검색" placeholder="프로젝트명·PM 검색" />
    </div>
    {visible.length ? <ul className={styles.cards}>{visible.map(project => {
      const data = project.competitionData!;
      const general = data.workspaceKind === 'project';
      const tasks = data.schedules ?? [];
      const completed = tasks.filter(task => task.status === 'done').length;
      return <li key={project.id}><a className={styles.card} aria-label={project.title + ' 열기'}
        href={projectHref(project.id, 'calendar')} onClick={event => open(event, project.id)}>
        <span className={styles.cardMeta}><span>{general ? '일반 프로젝트' : '설계공모'}</span>
          <span className={styles.status} data-active={group === 'active'}>{projectStatusLabel(data)}</span></span>
        <strong><ProjectColorDot project={project} />{project.title}</strong>
        <span className={styles.cardFooter}><span>업무 {tasks.length}건{completed > 0 && ' · 완료 ' + completed + '건'}</span>
          {data.pm && <span>PM {data.pm}</span>}</span>
      </a>{group === 'candidate' && <Link className={styles.setup} href={projectHref(project.id, 'process')}>진행 설정 →</Link>}</li>;
    })}</ul> : <p className={styles.empty}>{needle ? '검색한 프로젝트가 없습니다.' : directoryLabels[group] + '가 없습니다.'}</p>}
    </div>
    <section className={styles.common} aria-label="사무소 공통 업무">
      <div><h2>사무소 공통 업무</h2><p>회의, 행정, 경비 정산 등 사무소 운영 업무</p></div>
      <div className={styles.commonActions}>
        {office && <Link href={projectHref(office.id, 'schedule')}>공통 업무 보기</Link>}
        <button type="button" onClick={onCreateGeneralTask}>사무소 공통 업무 추가</button>
      </div>
    </section>
  </section>;
}
