'use client';

import { Reference, Collection } from './types';

const REF_KEY = 'arch_references';
const COL_KEY = 'arch_collections';

export function getRefs(): Reference[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(REF_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveRefs(refs: Reference[]): void {
  localStorage.setItem(REF_KEY, JSON.stringify(refs));
}

export function addRef(ref: Reference): void {
  saveRefs([ref, ...getRefs()]);
}

export function updateRef(updated: Reference): void {
  saveRefs(getRefs().map(r => r.id === updated.id ? updated : r));
}

export function deleteRef(id: string): void {
  saveRefs(getRefs().filter(r => r.id !== id));
}

export function getCollections(): Collection[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(COL_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveCollections(cols: Collection[]): void {
  localStorage.setItem(COL_KEY, JSON.stringify(cols));
}

export function addCollection(col: Collection): void {
  saveCollections([...getCollections(), col]);
}

export function deleteCollection(id: string): void {
  saveCollections(getCollections().filter(c => c.id !== id));
  saveRefs(getRefs().map(r => ({
    ...r,
    collectionIds: r.collectionIds.filter(cid => cid !== id),
  })));
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
