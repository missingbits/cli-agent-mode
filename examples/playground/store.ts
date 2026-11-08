import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface Note {
  id: number;
  title: string;
  tag: string | null;
  done: boolean;
}

interface Db {
  next: number;
  notes: Note[];
}

export function open(variant: string) {
  const file = process.env.NOTES_FILE ?? join(tmpdir(), `notes-${variant}.json`);
  const db: Db = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { next: 1, notes: [] };
  return { db, file, save: () => writeFileSync(file, JSON.stringify(db, null, 2)) };
}
