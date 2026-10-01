import type { DocParagraph, Material, Segment } from '../src/core/source.ts';

export const seg = (id: string, videoId: string, startMs: number, text: string, speaker = 1): Segment => ({
  id, videoId, startMs, endMs: startMs + 1000, speaker, text, flags: [],
});
export const par = (id: string, text: string): DocParagraph => {
  const [docId, n] = id.slice(1).split('.');
  return { id, docId: docId!, n: Number(n), text };
};

export const material: Material = {
  segments: [
    seg('S1', 'V1', 0, 'Мы закрываем Старый мост через Тишму'),
    seg('S2', 'V1', 1000, 'на капитальный ремонт с первого ноября.'),
    seg('S3', 'V1', 2000, 'Работы продлятся девяносто дней, это ёлка!'),
    seg('S4', 'V1', 3000, 'Омск и Иванов остались в стороне.'),
    seg('S5', 'V2', 0, 'Другой ролик про дорогу и мост.'),
  ],
  paragraphs: [par('P1.1', 'Ремонт начнётся 1 ноября и продлится 90 дней.'), par('P1.2', 'Второй абзац без чисел и имён.')],
};
