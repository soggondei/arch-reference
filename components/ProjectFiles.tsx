'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { ProjectFile, ProjectFileKind, ProjectFileStage } from '@/lib/project-files';
import type { Reference } from '@/lib/types';
import { projectHref } from '@/lib/workspace-navigation';
import styles from './ProjectFiles.module.css';

const stages: Record<ProjectFileStage, string> = { reference: '참고 자료', process: '과정 자료', final: '최종 결과물' };
const kinds: Record<ProjectFileKind, string> = { image: '이미지', drawing: '도면', model: '3D 모델', document: '문서', other: '기타' };
const stageKeys = Object.keys(stages) as ProjectFileStage[];
const kindKeys = Object.keys(kinds) as ProjectFileKind[];
const fileDate = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul' });

function suggestKind(name: string): ProjectFileKind {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['jpg','jpeg','png','tif','tiff','webp','gif','heic','avif','psd','svg','bmp'].includes(ext)) return 'image';
  if (['dwg','dxf','dgn','dwf','dwfx','plt'].includes(ext)) return 'drawing';
  if (['skp','3dm','3ds','obj','fbx','rvt','rfa','ifc','stl','blend','glb','gltf','dae','max','c4d','pln','nwd','nwc','usd','usdz'].includes(ext)) return 'model';
  if (['pdf','ai','indd','xlsx','xls','docx','doc','ppt','pptx','hwp','hwpx','txt','csv'].includes(ext)) return 'document';
  return 'other';
}

function sizeText(bytes: number) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 ** 2) return Math.ceil(bytes / 1024) + ' KB';
  return Number((bytes / 1024 ** 2).toFixed(1)) + ' MB';
}

async function fileRequest<T>(projectId: string, body?: Record<string, unknown>): Promise<T> {
  const response = body
    ? await fetch('/api/project-files', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, projectId }) })
    : await fetch('/api/project-files?projectId=' + encodeURIComponent(projectId), { cache: 'no-store' });
  const data = await response.json();
  if (!body && (response.status === 401 || response.status === 403)) return { connected: false } as T;
  if (!response.ok) throw new Error(data.error || '프로젝트 파일 요청을 완료하지 못했습니다.');
  return data;
}

type QueueEntry = { id: string; file: File; uploaded: boolean };
type Listing = { files?: ProjectFile[]; connected?: boolean; maxBytes?: number };
const detail = (error: unknown) => error instanceof Error ? error.message : '다시 시도해 주세요.';

export default function ProjectFiles({ project }: { project: Reference }) {
  const tasks = project.competitionData?.schedules ?? [];
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [maxBytes, setMaxBytes] = useState(0);
  const [connection, setConnection] = useState<'loading' | 'ready' | 'unpaired' | 'error'>('loading');
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [uploadStage, setUploadStage] = useState<ProjectFileStage>('process');
  const [uploadTask, setUploadTask] = useState('');
  const [kindOverride, setKindOverride] = useState<ProjectFileKind | ''>('');
  const [stageFilter, setStageFilter] = useState('');
  const [query, setQuery] = useState('');
  const [archived, setArchived] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const readId = useRef(0);

  const load = useCallback((signal?: AbortSignal) => {
    const id = ++readId.current;
    return fileRequest<Listing>(project.id).then(listing => {
      if (readId.current !== id || signal?.aborted) return;
      if (listing.connected === false) { setConnection('unpaired'); return; }
      if (!Array.isArray(listing.files) || !listing.maxBytes) throw new Error('파일 목록을 읽지 못했습니다.');
      setFiles(listing.files); setMaxBytes(listing.maxBytes); setConnection('ready');
    }).catch(e => {
      if (readId.current !== id || signal?.aborted) return;
      setConnection('error'); setError(detail(e));
    });
  }, [project.id]);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  function begin(label: string) {
    if (inFlight.current) return false;
    inFlight.current = true; setBusy(label); setError(''); setNotice(''); return true;
  }
  function finish() { inFlight.current = false; setBusy(''); }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!queue.length || !begin('upload')) return;
    let completed = 0;
    try {
      for (const entry of queue) {
        const { id, file } = entry;
        if (file.size === 0 || file.size > maxBytes) throw new Error(file.name + ' · 1 B부터 ' + sizeText(maxBytes) + '까지 업로드할 수 있습니다.');
        setNotice('업로드 중 · ' + file.name + ' (' + (completed + 1) + '/' + queue.length + ')');
        if (!entry.uploaded) {
          const prep = await fileRequest<{ uploadUrl?: string; ready?: boolean; uploaded?: boolean }>(project.id, {
            action: 'prepare', id, name: file.name, size: file.size, stage: uploadStage, taskId: uploadTask || null,
            kind: kindOverride || suggestKind(file.name),
          });
          if (!prep.ready && !prep.uploaded) {
            if (!prep.uploadUrl) throw new Error('업로드 주소를 받지 못했습니다.');
            const form = new FormData();
            form.append('cacheControl','0'); form.append('',file);
            const sent = await fetch(prep.uploadUrl, { method: 'PUT', credentials: 'omit',
              headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! }, body: form });
            if (!sent.ok) throw new Error(file.name + ' 전송을 완료하지 못했습니다. 다시 시도해 주세요.');
          }
          setQueue(current => current.map(item => item.id === id ? { ...item, uploaded: true } : item));
        }
        await fileRequest(project.id, { action: 'finish', id });
        completed++;
        setQueue(current => current.filter(item => item.id !== id));
      }
      if (input.current) input.current.value = '';
      setArchived(false); setQuery(''); setStageFilter(''); setNotice(completed + '개 파일을 업로드했습니다.');
    } catch (e) { setNotice(completed ? completed + '개 파일을 업로드했습니다.' : ''); setError(detail(e)); }
    finally { await load(); finish(); }
  }

  async function manage(file: ProjectFile, action: 'archive' | 'restore' | 'edit' | 'download', changes?: Record<string, unknown>) {
    if (!begin(file.id)) return;
    try {
      const result = await fileRequest<{ url?: string }>(project.id, { action, id: file.id, version: file.version, ...changes });
      if (action === 'download') {
        if (!result.url) throw new Error('다운로드 주소를 받지 못했습니다.');
        const a = document.createElement('a'); a.href = result.url; a.download = file.name; a.rel = 'noreferrer'; document.body.appendChild(a); a.click(); a.remove();
      } else {
        setEditing(null);
        setNotice(action === 'edit' ? '파일 분류를 저장했습니다.' : action === 'archive' ? '파일을 보관함으로 옮겼습니다.' : '파일을 복원했습니다.');
        await load();
      }
    } catch (e) { setError(detail(e)); if (action !== 'download') await load(); }
    finally { finish(); }
  }

  const currentTaskName = (file: ProjectFile) => tasks.find(task => task.id === file.taskId)?.taskName || file.taskName;
  const visible = files.filter(file => Boolean(file.archived) === archived && (!stageFilter || file.stage === stageFilter)
    && [file.name, currentTaskName(file), kinds[file.kind]].join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <section className={styles.panel} aria-label="프로젝트 파일">
    <div className={styles.head}><h2>프로젝트 파일</h2>{connection === 'ready' && <small>파일당 최대 {sizeText(maxBytes)}</small>}</div>
    {connection === 'loading' && <p role="status">파일을 불러오는 중…</p>}
    {connection === 'unpaired' && <p>연결된 기기에서 이 프로젝트의 파일을 열 수 있습니다. <Link href="/attendance">내 근태에서 기기 연결</Link></p>}
    {connection === 'error' && <button type="button" className={styles.secondary} onClick={() => { setError(''); void load(); }}>목록 다시 불러오기</button>}
    {connection === 'ready' && <>
      <form onSubmit={upload} aria-label="프로젝트 파일 업로드" className={styles.upload}>
        <fieldset disabled={!!busy}>
          <label className={styles.picker}>업로드할 파일<input ref={input} type="file" multiple onChange={e => {
            setQueue(Array.from(e.target.files ?? [], file => ({ id: crypto.randomUUID(), file, uploaded: false }))); setError(''); setNotice('');
          }} /></label>
          <div className={styles.controls}>
            <label>자료 구분<select value={uploadStage} onChange={e => setUploadStage(e.target.value as ProjectFileStage)}>{stageKeys.map(key => <option value={key} key={key}>{stages[key]}</option>)}</select></label>
            <label>파일 유형<select value={kindOverride} onChange={e => setKindOverride(e.target.value as ProjectFileKind | '')}><option value="">확장자로 분류</option>{kindKeys.map(key => <option value={key} key={key}>{kinds[key]}</option>)}</select></label>
            <label>연결 업무<select value={uploadTask} onChange={e => setUploadTask(e.target.value)}><option value="">프로젝트 전체</option>{tasks.map(task => <option value={task.id} key={task.id}>{task.taskName}</option>)}</select></label>
            <button className={styles.primary} disabled={!queue.length} type="submit">{busy === 'upload' ? '업로드 중…' : '파일 업로드' + (queue.length ? ' (' + queue.length + ')' : '')}</button>
          </div>
        </fieldset>
      </form>
      <div className={styles.tools}><div role="group" aria-label="파일 목록 선택">{[false,true].map(value => <button key={String(value)} type="button" aria-pressed={archived === value}
        onClick={() => { setArchived(value); setEditing(null); }}>{value ? '보관함' : '파일 목록'} {files.filter(f => Boolean(f.archived) === value).length}</button>)}</div>
        <select aria-label="자료 구분 필터" value={stageFilter} onChange={e => setStageFilter(e.target.value)}><option value="">모든 자료</option>{stageKeys.map(key => <option key={key} value={key}>{stages[key]}</option>)}</select>
        <input type="search" aria-label="파일 검색" placeholder="파일명·업무·유형 검색" value={query} onChange={e => setQuery(e.target.value)} /></div>
      {!visible.length ? <p className={styles.empty}>{stageFilter || query ? '조건에 맞는 파일이 없습니다.' : archived ? '보관함이 비어 있습니다.' : '아직 업로드한 파일이 없습니다.'}</p>
      : <ul className={styles.files}>{visible.map(file => <li key={file.id}>
        <div className={styles.entry}><div><strong>{file.name}</strong><small>{[stages[file.stage],kinds[file.kind],sizeText(file.size),fileDate.format(new Date(file.createdAt))].join(' · ')}</small>
          {file.taskId && <small>{tasks.some(t => t.id === file.taskId) ? <Link href={projectHref(project.id,'schedule',file.taskId)}>연결 업무 · {currentTaskName(file)}</Link> : '연결 업무 · ' + (file.taskName || '이전 업무')}</small>}</div>
          <div className={styles.buttons}><button disabled={!!busy} onClick={() => void manage(file,'download')}>다운로드</button>
            {!archived && <button disabled={!!busy} onClick={() => setEditing(editing === file.id ? null : file.id)}>분류 수정</button>}
            <button disabled={!!busy} onClick={() => void manage(file,archived ? 'restore' : 'archive')}>{archived ? '복원' : '보관'}</button></div></div>
        {editing === file.id && !archived && <form className={styles.controls} aria-label={file.name + ' 분류 수정'} onSubmit={e => {
          e.preventDefault(); const form = new FormData(e.currentTarget); void manage(file,'edit',{stage:form.get('stage'), kind:form.get('kind'), taskId:form.get('task') || null});
        }}><label>자료 구분<select name="stage" defaultValue={file.stage}>{stageKeys.map(k => <option key={k} value={k}>{stages[k]}</option>)}</select></label>
          <label>파일 유형<select name="kind" defaultValue={file.kind}>{kindKeys.map(k => <option key={k} value={k}>{kinds[k]}</option>)}</select></label>
          <label>연결 업무<select name="task" defaultValue={file.taskId ?? ''}><option value="">프로젝트 전체</option>
            {file.taskId && !tasks.some(t => t.id === file.taskId) && <option value={file.taskId}>{file.taskName || '이전 업무'}</option>}
            {tasks.map(t => <option key={t.id} value={t.id}>{t.taskName}</option>)}</select></label>
          <button className={styles.primary} disabled={!!busy}>분류 저장</button><button type="button" disabled={!!busy} onClick={() => setEditing(null)}>취소</button></form>}
      </li>)}</ul>}
    </>}
    {notice && <p role="status" className={styles.notice}>{notice}</p>}{error && <p role="alert" className={styles.error}>{error}</p>}
  </section>;
}
