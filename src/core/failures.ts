// Single source of user-facing Russian texts.
export const MOCK_UNKNOWN = 'Заглушка знает только демо-исходники. Включите настоящие модели';
export const REAL_MODELS_MISSING = 'Настоящие модели ещё не подключены';

export const DRAFT_FAILURES = {
  malformed_output: 'Модель вернула ответ в неверном виде. Черновик не создан',
  model_error: 'Модель не ответила. Черновик не создан',
} as const;
export type FailureCode = keyof typeof DRAFT_FAILURES;

export const NO_SOURCE_REASONS = {
  no_ref: 'Нет ссылки на исходник',
  unknown_ref: 'Ссылка ведёт на место, которого нет в исходниках',
  quote_too_short: 'Цитата слишком короткая, чтобы подтвердить факт',
  quote_not_found: 'Цитаты нет в исходнике дословно',
  number_mismatch: 'Число в факте не совпадает с числом в цитате',
} as const;
export type NoSourceReason = keyof typeof NO_SOURCE_REASONS;

export const SENTENCE_FLAGS = {
  unsupported_number: 'Число в предложении не подтверждено цитатой',
  unsupported_name: 'Имя или название в предложении не подтверждено цитатой',
  unmarked_fact: 'Предложение без фактов содержит число или имя',
} as const;
export type SentenceFlag = keyof typeof SENTENCE_FLAGS;

export const DRAFT_FLAGS = {
  conflict: 'Источники противоречат друг другу',
  insufficient: 'Исходников не хватает',
  instruction_in_source: 'В исходнике есть указание для модели; оно не выполнено',
} as const;
