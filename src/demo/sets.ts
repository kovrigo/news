import type { DraftKind } from '../adapters/llm/types.ts';

// Built-in invented source sets. The title equals the one in story.json.
export type SetInfo = {
  id: string;
  dir: string;
  title: string;
  description: string;
  videoNames: string[];
  docNames: string[];
  failKind?: DraftKind; // the first processing of this set fails on this draft once
};

export const SETS: SetInfo[] = [
  {
    id: 'bridge',
    dir: 'fixtures/demo/story-1',
    title: 'Ремонт Старого моста в Заречинске',
    description: 'Два видео и пресс-релиз. Часть фактов без исходника, в пресс-релизе есть указание сервису.',
    videoNames: ['Интервью: глава города', 'Интервью: подрядчик'],
    docNames: ['Пресс-релиз администрации'],
  },
  {
    id: 'school',
    dir: 'fixtures/demo-sets/school',
    title: 'Открытие спортзала в школе № 7 посёлка Лугово',
    description: 'Два видео и заметка пресс-службы. Есть неразборчивая речь, речь не на русском, расхождение в цифрах и титры не из справочника.',
    videoNames: ['Директор и учитель', 'Родитель'],
    docNames: ['Заметка пресс-службы'],
  },
  {
    id: 'fair',
    dir: 'fixtures/demo-sets/fair',
    title: 'Ярмарка выходного дня в Берёзовке',
    description: 'Одно видео и объявление администрации. Один черновик не построится с первого раза: так видно сбой и «Повторить».',
    videoNames: ['Организатор ярмарки'],
    docNames: ['Объявление администрации'],
    failKind: 'syncs',
  },
  {
    id: 'reading-room',
    dir: 'fixtures/demo-sets/reading-room',
    title: 'Летняя читальня на набережной',
    description: 'Одно видео, документов нет. Чистый набор: пометок почти не бывает.',
    videoNames: ['Заведующая библиотекой'],
    docNames: [],
  },
];
export const setById = (id: string): SetInfo | undefined => SETS.find((s) => s.id === id);
