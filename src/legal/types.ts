export type LegalBlock =
  | { type: 'h1' | 'h2' | 'h3' | 'p'; text: string }
  | { type: 'ul'; items: string[] };

export interface LegalDocument {
  id: 'privacy' | 'consent';
  title: string;
  blocks: LegalBlock[];
  /** Путь публичной веб-страницы документа, например "/privacy". Где именно она размещена — см. README. */
  urlPath: string;
}
