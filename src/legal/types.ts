export type LegalBlock =
  | { type: 'h1' | 'h2' | 'h3' | 'p'; text: string }
  | { type: 'ul'; items: string[] };

export interface LegalDocument {
  id: 'privacy' | 'consent';
  title: string;
  blocks: LegalBlock[];
  /** Путь публичной страницы на Firebase Hosting, например "/privacy". */
  urlPath: string;
}
