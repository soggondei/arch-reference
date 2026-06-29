import { supabase } from './supabase';
import { Reference, Collection, CompetitionData } from './types';

// ── Row mappers ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toRef(row: any): Reference {
  return {
    id: row.id,
    title: row.title,
    imageUrl: row.image_url ?? '',
    sourceUrl: row.source_url ?? undefined,
    refType: row.ref_type ?? undefined,
    architect: row.architect ?? undefined,
    year: row.year ?? undefined,
    description: row.description ?? undefined,
    tags: row.tags ?? { program: [], material: [], mass: [], scale: '', designItem: [], site: [], region: '' },
    collectionIds: row.collection_ids ?? [],
    createdAt: row.created_at,
    competitionData: row.competition_data ?? undefined,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toCollection(row: any): Collection {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    color: row.color,
    createdAt: row.created_at,
  };
}

// ── References ──────────────────────────────────────────────────────────────

export async function getRefs(): Promise<Reference[]> {
  const { data, error } = await supabase
    .from('refs')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toRef);
}

export async function addRef(ref: Reference): Promise<void> {
  const { error } = await supabase.from('refs').insert({
    id: ref.id,
    title: ref.title,
    image_url: ref.imageUrl || null,
    source_url: ref.sourceUrl || null,
    ref_type: ref.refType || null,
    architect: ref.architect || null,
    year: ref.year || null,
    description: ref.description || null,
    tags: ref.tags,
    collection_ids: ref.collectionIds,
    created_at: ref.createdAt,
    competition_data: ref.competitionData ?? null,
  });
  if (error) throw error;
}

export async function updateRef(updated: Reference): Promise<void> {
  const { error } = await supabase
    .from('refs')
    .update({
      title: updated.title,
      image_url: updated.imageUrl || null,
      source_url: updated.sourceUrl || null,
      ref_type: updated.refType || null,
      architect: updated.architect || null,
      year: updated.year || null,
      description: updated.description || null,
      tags: updated.tags,
      collection_ids: updated.collectionIds,
      competition_data: updated.competitionData ?? null,
    })
    .eq('id', updated.id);
  if (error) throw error;
}

export async function updateCompetitionStatus(id: string, competitionData: CompetitionData): Promise<void> {
  const { error } = await supabase
    .from('refs')
    .update({ competition_data: competitionData })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteRef(id: string): Promise<void> {
  const { error } = await supabase.from('refs').delete().eq('id', id);
  if (error) throw error;
}

// ── Collections ─────────────────────────────────────────────────────────────

export async function getCollections(): Promise<Collection[]> {
  const { data, error } = await supabase
    .from('collections')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toCollection);
}

export async function addCollection(col: Collection): Promise<void> {
  const { error } = await supabase.from('collections').insert({
    id: col.id,
    name: col.name,
    description: col.description || null,
    color: col.color,
    created_at: col.createdAt,
  });
  if (error) throw error;
}

export async function deleteCollection(id: string): Promise<void> {
  const { error: e1 } = await supabase.from('collections').delete().eq('id', id);
  if (e1) throw e1;

  const { data: affected } = await supabase
    .from('refs')
    .select('id, collection_ids')
    .contains('collection_ids', [id]);

  if (affected && affected.length > 0) {
    await Promise.all(
      affected.map(r =>
        supabase
          .from('refs')
          .update({ collection_ids: (r.collection_ids as string[]).filter((cid: string) => cid !== id) })
          .eq('id', r.id)
      )
    );
  }
}

// ── Image Upload ────────────────────────────────────────────────────────────

export async function uploadImage(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${generateId()}.${ext}`;
  const { error } = await supabase.storage
    .from('reference-images')
    .upload(path, file, { upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from('reference-images').getPublicUrl(path);
  return data.publicUrl;
}

// ── Utils ────────────────────────────────────────────────────────────────────

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
