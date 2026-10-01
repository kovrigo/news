// Russian texts of the demo server. The core catalog (src/core/failures.ts) stays the source for source-link reasons.
import type { Kind, DState, Role } from './domain/types.ts';

export const BANNER = 'Демо на придуманных данных. Не загружайте и не вставляйте настоящие материалы.';
export const EXPORT_BANNER = 'ДЕМО — придуманные данные, не для эфира';
export const REAL_MODELS_REFUSED = (v: string): string => `Демо работает только на заглушках: MODELS=${v} не поддерживается`;
export const NO_PORT = 'Не задан PORT. Запускайте демо командой `paneweb up`';

export const NEWSROOM = 'Демо-редакция „Заречье-ТВ“';
export const TIME_ZONE = 'Europe/Moscow';

export const ROLE_LABELS: Record<Role, string> = {
  correspondent: 'корреспондент',
  editor: 'выпускающий редактор, право утверждать',
  chief: 'главный редактор',
};

export const DRAFT_NAMES: Record<Kind, string> = {
  transcript: 'Расшифровка',
  syncs: 'Синхроны',
  titles: 'Титры',
  voiceover: 'Закадровый текст',
  leadin: 'Подводка',
};
export const APPROVE_LABELS: Record<Kind, string> = {
  transcript: 'Утвердить расшифровку',
  syncs: 'Утвердить синхроны',
  titles: 'Утвердить титры',
  voiceover: 'Утвердить закадровый текст',
  leadin: 'Утвердить подводку',
};
const GENDER: Record<Kind, 'f' | 'm' | 'p'> = { transcript: 'f', syncs: 'p', titles: 'p', voiceover: 'm', leadin: 'f' };

// Short passive forms agree with the draft name: «Подводка утверждена», «Титры утверждены».
const agree = (kind: Kind, masculine: string): string => {
  const g = GENDER[kind];
  return g === 'm' ? masculine : masculine.replace(/[её]н$/, g === 'f' ? 'ена' : 'ены');
};

export function stateWord(kind: Kind, state: DState, exported: boolean): string {
  switch (state) {
    case 'preparing': return 'Готовится';
    case 'draft': return 'Черновик';
    case 'review': return 'На проверке';
    case 'returned': return agree(kind, 'Возвращён');
    case 'approved': return agree(kind, exported ? 'Выгружен' : 'Утверждён');
    case 'reapprove': return 'Нужно утвердить снова';
    case 'not_built': return agree(kind, 'Не построен');
    case 'failed': return 'Сбой';
    case 'not_needed': return 'Не нужен в этом сюжете';
  }
}

export const E = {
  noStory: 'Сюжет не найден',
  noAddress: 'Нет такого адреса',
  noDraft: 'Нет такого черновика',
  noId: 'Нет такой записи',
  noUser: 'Нет такой учётной записи',
  disabled: 'Учётная запись отключена',
  needLogin: 'Войдите в демо, выбрав учётную запись',
  forbidden: 'Это действие вам недоступно',
  bodyTooBig: 'Запрос слишком большой. Демо принимает только короткий текст',
  badBody: 'Запрос не понят: лишние или пропущенные поля',
  sentenceLong: 'Предложение длиннее 300 знаков',
  commentLong: 'Комментарий и причина не длиннее 500 знаков',
  fieldLong: 'Поле не длиннее 120 знаков',
  empty: 'Поле не должно быть пустым',
  noSet: 'Нет такого набора исходников',
  staleVersion: 'Черновик изменился. Проверьте новую версию',
  commentEmpty: 'Напишите, что исправить',
  notApproved: 'Черновик не утверждён, не выгружается',
  lockedBy: (n: string): string => `Сейчас правит ${n}`,
  needConfirm: 'Правка снимет утверждение. Подтвердите правку',
  notEditable: 'Этот черновик сейчас нельзя править',
  noMark: 'Нет такой пометки',
  badDecision: 'Для этой пометки такого решения нет',
  undoApproved: 'После утверждения решение отменить нельзя',
  notReturnable: 'Этот черновик сейчас нельзя вернуть',
  notSubmittable: 'Этот черновик сейчас нельзя отправить на проверку',
  notApprovable: 'Этот черновик сейчас нельзя утвердить',
  checking: 'Идёт проверка правки. Дождитесь результата',
  pendingMarks: (n: number): string => `${n} ${plural(n, 'пометка ждёт', 'пометки ждут', 'пометок ждут')} решения`,
  returnedWait: 'Черновик возвращён. Он снова уйдёт на проверку после правки',
  notBuiltBlock: 'Черновик не построен: мало материала',
  preparing: 'Черновик ещё готовится',
  failedBlock: 'Обработка черновика не удалась. Повторите её',
  notNeededBlock: 'Черновик отмечен как ненужный в этом сюжете',
  alreadyApproved: 'Черновик уже утверждён',
  notApprover: 'Утверждать могут только сотрудники с правом утверждать',
  selfDisable: 'Себя отключить нельзя',
  badRange: 'Начало должно быть раньше конца и лежать внутри видео',
  noFragment: 'В исходниках нет такого места',
  exportNothing: 'Не выбрано ни одного черновика',
  exportOffline: 'Выгрузка недоступна без связи',
  sentenceEmpty: 'Предложение не должно быть пустым',
  notFailed: 'Повторить можно только черновик со сбоем',
  baseNone: 'Нужно хотя бы одно предложение',
};

export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

export const MARK_LABELS = {
  no_source: 'Факт без исходника',
  sentence_flag: 'Предложение не подтверждено исходником',
  title_name: 'Титр не из справочника',
  title_position: 'Должность не совпадает со справочником',
  title_no_source: 'Титр без исходника',
  place: 'Топоним не из справочника',
  unclear: 'Неразборчиво',
  not_russian: 'Речь не на русском',
  conflict: 'Исходники расходятся',
  insufficient: 'Материала мало',
  unverifiable: 'Не удалось проверить',
} as const;

export const ACTION_LABELS: Record<string, string> = {
  create_story: 'Загрузил(а) сюжет',
  submit: 'Отправил(а) на проверку',
  approve: 'Утвердил(а)',
  return: 'Вернул(а) с комментарием',
  edit: 'Правил(а)',
  remove_phrase: 'Удалил(а) фразу',
  take_over: 'Взял(а) на себя без исходника',
  undo: 'Отменил(а) решение',
  confirm: 'Подтвердил(а) по справочнику',
  keep_unclear: 'Оставил(а) неразборчивым',
  checked_ru: 'Отметил(а) проверенным',
  pick_source: 'Взял(а) исходник из расхождения',
  accept_asis: 'Принял(а) как есть',
  not_needed: 'Отметил(а) «Не нужен в этом сюжете»',
  needed: 'Вернул(а) черновик в работу',
  add_directory: 'Добавил(а) в справочник',
  set_source: 'Указал(а) исходник',
  rename_speaker: 'Переименовал(а) говорящего',
  retry: 'Повторил(а) обработку',
  export: 'Выгрузил(а)',
  delete_story: 'Удалил(а) сюжет',
  directory_edit: 'Правил(а) справочник',
  staff_edit: 'Изменил(а) права сотрудника',
};

export const STORY_DELETED = 'сюжет удалён';
export const NO_EDITOR = 'человек не правил';
