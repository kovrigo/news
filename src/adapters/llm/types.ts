export type DraftKind = 'syncs' | 'titles' | 'voiceover' | 'leadin';
export type DraftRequest = { kind: DraftKind; instructions: string; material: string };
export interface DraftModel {
  name: string;
  build(req: DraftRequest): Promise<{ raw: string; costRub: number }>;
}
