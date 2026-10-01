# Проверка внешнего вида демо

Проверка 1 октября 2026 года. Проверены все экраны демо на ширине 1280 и 390 пикселей, рабочее место сюжета ещё на 900. Образец — макет A и система оформления.

## Итог

- Демо совпадает с макетом A: три колонки, колонка таймкодов, жёлтые пометки, отметка утверждения на листе, одна синяя кнопка на экране.
- Найдено 14 дефектов. Все исправлены и проверены повторно.
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

## Что проверено и в порядке

- Путь редактора: список, сюжет, пометки, «Указать исходник», утверждение, выгрузка. Пока пометки ждут решения, кнопка утверждения недоступна, причина написана рядом.
- Длинный текст: предложение в 300 знаков, ФИО и должность длиной в три строки. Всё переносится, ничего не обрезано.
- Без связи: тёмная полоса «Нет связи», в подвале листа «Не сохранено: нет связи», утвердить и выгрузить нельзя. Когда связь возвращается, правка сохраняется.
- Прокрутка: колонки прокручиваются отдельно. Ни один экран не прокручивается вбок.
- Доступность: фокус виден синей рамкой. Нажатие на факт переводит фокус в панель исходника. Кнопки на телефоне не ниже 44 пикселей.

## Осталось, мелкое

- В режиме правки поле предложения высотой в три строки. Длинное предложение приходится прокручивать внутри поля.
- На телефоне подсветка выбранного факта ложится заплатками на соседние строки.
- Под кнопкой утверждения повторяется «N пометки ждут решения». Та же причина написана строкой выше.
- На экране 1280 на 800 шапка сюжета занимает 230 пикселей. Под лист остаётся около 570.
- В выгрузке DOCX подпись «Утвердил:» мужского рода. Её проверяет тест выгрузки, менять нужно вместе с ним.
- На телефоне название редакции и ссылка «Сюжеты» в пути ниже 44 пикселей.

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

## Проверки

- `bun run typecheck` — код выхода 0.
- `bun run test` — код выхода 0: 187 тестов прошли, 0 упали.
- `bun run quality --models=mock --set=fixtures/demo` — код выхода 0.
- `bun run e2e` — код выхода 0: 8 из 8 сценариев.
- `bun run demo-reset` после проверок — код выхода 0.

Проверка выполнена моделью. Она не заменяет проверку дизайнером и людьми с экранным диктором.
