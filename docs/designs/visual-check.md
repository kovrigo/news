# Проверка внешнего вида демо

Проверка 1 октября 2026 года. Проверены все экраны демо на ширине 1280 и 390 пикселей, рабочее место сюжета ещё на 900. Образец — макет A и система оформления.

## Итог

- Демо совпадает с макетом A: три колонки, колонка таймкодов, жёлтые пометки, отметка утверждения на листе, одна синяя кнопка на экране.
- Найдено 18 дефектов. Все исправлены и проверены повторно.
- Автоматическая проверка доступности по WCAG A и AA не нашла нарушений ни на одном экране при обеих ширинах.
- После проверок демо сброшено.

## Исправлено

1. Рабочее место сюжета: колесо мыши прокручивало всю страницу на 480 пикселей в пустоту. Заголовок и надпись о демо уходили с экрана. Теперь прокручиваются только колонки.
2. У утверждённого черновика стоял жёлтый «!», знак «нужен человек». Теперь зелёная галочка.
3. Предупреждение о ручном исходнике выглядело обычным серым абзацем. Теперь у него жёлтый «!» и первая фраза жирным. Подпись «вручную» у таймкода выделена цветом проверки.
4. Сотрудники и справочник на телефоне: кнопки «Править», «Удалить», «Отключить» уходили за правый край. Признака прокрутки не было. Теперь каждая строка — блок с подписями столбцов.
5. Журнал на телефоне: страница прокручивалась вбок, столбец с действием был скрыт. Теперь строки идут блоками.
6. Журнал показывал внутренний код фрагмента «S6» вместо места в исходнике. Теперь видно «Интервью: глава города, 00:26–00:32». Добавлен тест.
7. Строка журнала читалась «Утвердил. версия 1». Теперь «Утвердил(а) — версия 1».
8. Глаголы журнала стояли в мужском роде и у Ольги, и у Анны. Теперь «Отправил(а)», «Взял(а) на себя», как уже было в полосе возврата. Столбец назван «Действие».
9. Название редакции стояло в кавычках „“. Теперь в «ёлочках».
10. В списке сюжетов слова «ещё не утверждён» были набраны моноширинным шрифтом. Теперь им набрана только длительность.
11. Кнопка «Воспроизвести» на телефоне была 32 пикселя в высоту. Теперь 44.
12. Время плеера и текст в выбранном месте не читались экранным диктором. Теперь читаются.
13. Скобка синхрона была коротким значком под таймкодом. Теперь она идёт рядом с таймкодом от начала синхрона до конца. На телефоне таймкод стоит над фразой, скобки там нет.
14. На экране входа имя и роль стояли по центру с рваным краем. Теперь по левому краю.
15. В режиме правки поле предложения было высотой в три строки, длинное предложение приходилось прокручивать внутри поля. Теперь поле растёт вместе с текстом, в том числе при наборе.
16. На телефоне подсветка выбранного факта заходила на соседние строки. Зона нажатия осталась 44 пикселя, а подсветка лежит только на строке текста.
17. Под кнопкой утверждения повторялась причина, уже написанная строкой выше. Теперь причина написана один раз. Под кнопкой остаётся только «Без связи утвердить нельзя», когда связи нет.
18. В выгрузке подпись утверждения была «Утвердил:» при любом утверждающем. Теперь «Утверждено: имя, дата и время», как в отметке на листе. Тест выгрузки обновлён: он ждёт новую подпись в текстовом файле и в DOCX, когда утверждает Анна. На старом коде тест падает.

## Что проверено и в порядке

- Путь редактора: список, сюжет, пометки, «Указать исходник», утверждение, выгрузка. Пока пометки ждут решения, кнопка утверждения недоступна, причина написана рядом.
- Длинный текст: предложение в 300 знаков, ФИО и должность длиной в три строки. Всё переносится, ничего не обрезано.
- Без связи: тёмная полоса «Нет связи», в подвале листа «Не сохранено: нет связи», утвердить и выгрузить нельзя. Когда связь возвращается, правка сохраняется.
- Прокрутка: колонки прокручиваются отдельно. Ни один экран не прокручивается вбок.
- Доступность: фокус виден синей рамкой. Нажатие на факт переводит фокус в панель исходника. Кнопки на телефоне не ниже 44 пикселей.
- Выгрузка: Анна утвердила синхроны и выгрузила их в DOCX и в текстовый файл из интерфейса, ошибок нет. Внутри обоих файлов строка «Утверждено: Анна Пробная, 1 октября 2026, 18:44 (Europe/Moscow)», слова «Утвердил» нет.

## Осталось, мелкое

- На экране 1280 на 800 шапка сюжета занимает 230 пикселей. Под лист остаётся около 570.
- На телефоне название редакции и ссылка «Сюжеты» в пути ниже 44 пикселей.

## Режим браузера

Снимки и ручные проверки сделаны во встроенном браузере проверки: Chromium без окна, версия HeadlessChrome 151.0.7922.34. Флаги запуска `--headless`, `--hide-scrollbars`, `--no-sandbox`. Масштаб 1, полосы прокрутки на снимках скрыты.

Изоляцию процессов Chromium пришлось выключить настройкой `GSTACK_CHROMIUM_NO_SANDBOX=1`. Причина: на этой машине Chromium с изоляцией не стартует, ошибка «No usable sandbox». Браузер запущен так один раз в прошлом раунде. В этом раунде настройки изоляции не менялись.

Ограничения режима:

- Без изоляции код открытой страницы не отделён от учётной записи системы. Поэтому браузер открывал только локальное демо на придуманных данных. Чужие сайты в этом режиме открывать нельзя.
- Проверен только Chromium. Safari, Firefox и настоящий телефон не проверялись. Узкая ширина — это окно 390 пикселей, а не сенсорное устройство.
- Ширина страницы проверялась замером, потому что полосы прокрутки на снимках не видны.
- Отсутствие связи на снимках изображено блокировкой запросов внутри страницы. Настоящий обрыв сети проверяют сквозные сценарии. Они идут в отдельном браузере, который запускает само демо; его настройки я не менял.
- Экранный диктор не запускался. Доступность проверена автоматической проверкой WCAG A и AA и деревом доступности браузера.

## Снимки после исправлений

Ширина 1280:

- `/srv/projects/news/worktrees/task-work-3/docs/designs/visual-check/a01-login-1280.png` — вход
- `/srv/projects/news/worktrees/task-work-3/docs/designs/visual-check/a02-list-1280.png` — список сюжетов
- `/srv/projects/news/worktrees/task-work-3/docs/designs/visual-check/a03-story-returned-1280.png` — сюжет, черновик вернули с комментарием
- `/srv/projects/news/worktrees/task-work-3/docs/designs/visual-check/a04-marks-approve-blocked-1280.png` — пометки, утверждение недоступно
- `/srv/projects/news/worktrees/task-work-3/docs/designs/visual-check/a05-syncs-review-1280.png` — синхроны на проверке, скобки синхронов
- `/srv/projects/news/worktrees/task-work-3/docs/designs/visual-check/a06-syncs-approved-1280.png` — синхроны утверждены, выгрузка
- `/srv/projects/news/worktrees/task-work-3/docs/designs/visual-check/a06b-approval-mark-1280.png` — отметка утверждения на листе
- `/srv/projects/news/worktrees/task-work-3/docs/designs/visual-check/a07-pick-place-1280.png` — выбор места в исходнике
- `/srv/projects/news/worktrees/task-work-3/docs/designs/visual-check/a08-manual-source-1280.png` — предупреждение о ручном исходнике
- `/srv/projects/news/worktrees/task-work-3/docs/designs/visual-check/a09-manual-gutter-1280.png` — подпись «вручную» у таймкода
- `/srv/projects/news/worktrees/task-work-3/docs/designs/visual-check/a10-offline-long-text-1280.png` — нет связи во время правки
- `/srv/projects/news/worktrees/task-work-3/docs/designs/visual-check/a11-long-text-1280.png` — длинное предложение
- `/srv/projects/news/worktrees/task-work-3/docs/designs/visual-check/a12-journal-1280.png` — журнал
- `/srv/projects/news/worktrees/task-work-3/docs/designs/visual-check/a12-directory-1280.png` — справочник
- `/srv/projects/news/worktrees/task-work-3/docs/designs/visual-check/a12-new-1280.png` — новый сюжет

Ширина 900:

- `/srv/projects/news/worktrees/task-work-3/docs/designs/visual-check/a13-panel-900.png` — панель исходника поверх листа

Ширина 390:

- `/srv/projects/news/worktrees/task-work-3/docs/designs/visual-check/b00-login-390.png` — вход
- `/srv/projects/news/worktrees/task-work-3/docs/designs/visual-check/b01-list-390.png` — список сюжетов
- `/srv/projects/news/worktrees/task-work-3/docs/designs/visual-check/b02-story-390.png` — сюжет
- `/srv/projects/news/worktrees/task-work-3/docs/designs/visual-check/b03-fact-source-390.png` — исходник под фактом
- `/srv/projects/news/worktrees/task-work-3/docs/designs/visual-check/b04-marks-manual-390.png` — пометки и ручной исходник
- `/srv/projects/news/worktrees/task-work-3/docs/designs/visual-check/b05-offline-390.png` — нет связи
- `/srv/projects/news/worktrees/task-work-3/docs/designs/visual-check/b06-journal-390.png` — журнал
- `/srv/projects/news/worktrees/task-work-3/docs/designs/visual-check/b06-directory-390.png` — справочник
- `/srv/projects/news/worktrees/task-work-3/docs/designs/visual-check/b07-staff-390.png` — сотрудники

Второй раунд, пункты 15–18:

- `/srv/projects/news/worktrees/task-work-3/docs/designs/visual-check/g1-after-1280.png` — длинное предложение в поле правки, 1280
- `/srv/projects/news/worktrees/task-work-3/docs/designs/visual-check/g1-after-390.png` — длинное предложение в поле правки, 390
- `/srv/projects/news/worktrees/task-work-3/docs/designs/visual-check/g2-after-390.png` — подсветка выбранного факта на телефоне
- `/srv/projects/news/worktrees/task-work-3/docs/designs/visual-check/g2-after-mark-390.png` — жёлтые пометки на телефоне
- `/srv/projects/news/worktrees/task-work-3/docs/designs/visual-check/g3-after-1280.png` — причина недоступности утверждения один раз, 1280
- `/srv/projects/news/worktrees/task-work-3/docs/designs/visual-check/g3-after-390.png` — то же, 390
- `/srv/projects/news/worktrees/task-work-3/docs/designs/visual-check/g3-offline-1280.png` — без связи под кнопкой только «Без связи утвердить нельзя»
- `/srv/projects/news/worktrees/task-work-3/docs/designs/visual-check/h1-export-1280.png` — утверждено Анной, выгрузка в DOCX и текстовый файл, 1280
- `/srv/projects/news/worktrees/task-work-3/docs/designs/visual-check/h1-export-390.png` — то же, 390

## Снимки до исправлений

- `/srv/projects/news/worktrees/task-work-3/docs/designs/visual-check/f1-before-1280.png` — пустая прокрутка страницы (пункт 1)
- `/srv/projects/news/worktrees/task-work-3/docs/designs/visual-check/f2-before-1280.png` — жёлтый «!» у утверждённого (пункт 2)
- `/srv/projects/news/worktrees/task-work-3/docs/designs/visual-check/f3-before-1280.png` — серое предупреждение о ручном исходнике (пункт 3)
- `/srv/projects/news/worktrees/task-work-3/docs/designs/visual-check/f4-before-390.png` — справочник, кнопки за краем (пункт 4)
- `/srv/projects/news/worktrees/task-work-3/docs/designs/visual-check/f4-before-staff-390.png` — сотрудники, столбец за краем (пункт 4)
- `/srv/projects/news/worktrees/task-work-3/docs/designs/visual-check/f5-before-390.png` — журнал шире экрана (пункт 5)
- `/srv/projects/news/worktrees/task-work-3/docs/designs/visual-check/f6-before-1280.png` — коды «S6» и мужской род в журнале (пункты 6–8)
- `/srv/projects/news/worktrees/task-work-3/docs/designs/visual-check/f10-before-1280.png` — моноширинные слова в списке (пункт 10)
- `/srv/projects/news/worktrees/task-work-3/docs/designs/visual-check/f13-before-1280.png` — короткие скобки синхронов (пункт 13)
- `/srv/projects/news/worktrees/task-work-3/docs/designs/visual-check/f14-before-1280.png` — вход с рваным краем (пункт 14)
- `/srv/projects/news/worktrees/task-work-3/docs/designs/visual-check/g1-before-1280.png` — поле правки обрезает длинное предложение (пункт 15)
- `/srv/projects/news/worktrees/task-work-3/docs/designs/visual-check/g2-before-390.png` — подсветка факта на соседних строках (пункт 16)
- `/srv/projects/news/worktrees/task-work-3/docs/designs/visual-check/g3-before-1280.png` — причина повторяется под кнопкой, 1280 (пункт 17)
- `/srv/projects/news/worktrees/task-work-3/docs/designs/visual-check/g3-before-390.png` — то же, 390 (пункт 17)

## Проверки

Последний прогон, после всех исправлений:

- `bun run typecheck` — код выхода 0.
- `bun run test` — код выхода 0: 188 тестов прошли, 0 упали.
- `bun test test/demo-export.test.ts` — код выхода 0. Новый тест подписи на старом коде даёт код 1.
- `bun run quality --models=mock --set=fixtures/demo` — код выхода 0.
- `bun run e2e` — код выхода 0: 8 из 8 сценариев.
- Автоматическая проверка доступности на затронутых экранах при 1280 и 390 — нарушений нет. Страница не шире экрана, кнопки в листе на телефоне не ниже 44 пикселей.
- `bun run demo-reset` после проверок — код выхода 0.

Проверка выполнена моделью. Она не заменяет проверку дизайнером и людьми с экранным диктором.
