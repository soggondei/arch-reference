'use client';

import { useCallback, useEffect, useState } from 'react';
import type { WorkLog } from './types';

type Result = { projectId: string; logs: WorkLog[]; error: string };
const emptyLogs: WorkLog[] = [];
const changed = 'lv-personal-work-change';

export function useProjectSharedLogs(projectId?: string | null) {
  const [result, setResult] = useState<Result | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  useEffect(() => {
    if (!projectId) return;
    const id = projectId;
    let current: AbortController;
    async function load() {
      current?.abort();
      const controller = new AbortController();
      current = controller;
      try {
        const response = await fetch('/api/project-work?projectId=' + encodeURIComponent(id), {
          signal: controller.signal, cache: 'no-store',
        });
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (!Array.isArray(data.logs)) throw new Error();
        if (!controller.signal.aborted) setResult({ projectId: id, logs: data.logs, error: '' });
      } catch {
        if (!controller.signal.aborted) {
          setResult({ projectId: id, logs: emptyLogs, error: '프로젝트에 공유한 시간을 불러오지 못했습니다.' });
        }
      }
    }
    void load();
    const refreshOnFocus = () => { if (document.visibilityState === 'visible') void load(); };
    const refreshOnStorage = (event: StorageEvent) => { if (event.key === changed) void load(); };
    window.addEventListener(changed, load);
    window.addEventListener('storage', refreshOnStorage);
    document.addEventListener('visibilitychange', refreshOnFocus);
    return () => {
      current?.abort();
      window.removeEventListener(changed, load);
      window.removeEventListener('storage', refreshOnStorage);
      document.removeEventListener('visibilitychange', refreshOnFocus);
    };
  }, [projectId, attempt]);
  const data = result?.projectId === projectId ? result : null;
  return { logs: data?.logs ?? emptyLogs, loading: !!projectId && !data, error: data?.error ?? '', retry };
}
