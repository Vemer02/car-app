import { database } from '../db';
import { WHATS_NEW, WhatsNewEntry } from '../whatsnew/entries';

// Храним в localStorage самой WatermelonDB — это по устройству, не по аккаунту: если на
// одном телефоне сменится пользователь, окно не будет настойчиво показываться по новой
// (ровно то поведение, которого ждёшь от большинства приложений).
const SEEN_KEY = 'whatsNewSeenVersion';

/** Чистая логика, без обращения к хранилищу — отдельно, чтобы было легко проверить тестом. */
export function selectUnseenEntries(entries: WhatsNewEntry[], seenVersion: number): WhatsNewEntry[] {
  return entries.filter((e) => e.version > seenVersion).sort((a, b) => b.version - a.version);
}

export async function getUnseenWhatsNew(): Promise<WhatsNewEntry[]> {
  const raw = await database.localStorage.get<string>(SEEN_KEY);
  const seen = raw ? Number(raw) : 0;
  return selectUnseenEntries(WHATS_NEW, seen);
}

export async function markWhatsNewSeen(): Promise<void> {
  const latest = WHATS_NEW.reduce((max, e) => Math.max(max, e.version), 0);
  await database.localStorage.set(SEEN_KEY, String(latest));
}
