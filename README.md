# news-draft-assistant: demo on invented data

The demo shows the whole work with a draft package of one story: three roles, the story screen from mockup A, yellow marks and decisions, editing, approval, return, export, journal, staff, directory, delete. **All people, places, organisations and events are invented. The demo uses invented data only.** Nothing is uploaded, no model is called, no network client is in the code. Processing runs only on the recorded mock adapters.

## View the demo

```
bun install
bun run demo-reset
paneweb up
```

Open the URL that `paneweb up` prints (the `local:` address works on this machine only; the server listens on `127.0.0.1` and on the port paneweb gives). Pick a demo account on the login page, no password:

- Ольга Демина — корреспондент;
- Павел Тестов — выпускающий редактор, право утверждать;
- Анна Пробная — главный редактор.

Typed text is not filtered: sentence edits, return comments, reasons, speaker names and directory entries are saved as entered. No program can tell invented text from real material, so the rule is on people: never type or paste real material or real people's data into the demo. Everything typed is written to `out/demo/state.json` on this machine at once; `bun run demo-reset` replaces that file with the invented seed, which removes it. An edit not yet saved while offline waits in the browser's localStorage until it is saved or cancelled; `demo-reset` does not touch the browser.

A role switch is «Сменить роль»: a logout plus a login. Every page carries the banner «Демо на придуманных данных. Не загружайте и не вставляйте настоящие материалы.», every exported file starts with `ДЕМО — придуманные данные, не для эфира`.

Stop it with `paneweb down`. Never start the server by hand: `bun run dev` needs `PORT`, which only paneweb sets.

## Commands

| Command | Prints | Exit |
|---------|--------|------|
| `bun install` | installed packages | 0 |
| `bun run demo-reset` | `Демо сброшено: out/demo/state.json` (the path is `$DEMO_STATE` when set); writes the seed state: four invented stories built by the real core code | 0 |
| `paneweb up` | `up  <url>  (local: http://127.0.0.1:<port>/)`; starts `bun run dev` | 0 |
| `bun run dev` | `Демо: http://127.0.0.1:<port>/`. Without `PORT` it prints a hint to use `paneweb up` and exits 2. With `MODELS` set to anything but `mock` it prints `Демо работает только на заглушках: MODELS=<value> не поддерживается` and exits 2. Without a state file it asks for `bun run demo-reset` and exits 2 | runs until stopped |
| `bun run test` | `bun test` summary: pass and fail counts. No network, no server | 0 when all pass |
| `bun run typecheck` | nothing when clean (`tsc --noEmit`) | 0 |
| `bun run e2e` | runs `demo-reset`, takes the URL from `paneweb up` and the CDP address from `paneweb browser`, drives the browser; one line per scenario: `ok   <scenario>` or `FAIL <scenario>: <reason>` | 0 when all pass, 1 otherwise |
| `bun run quality --models=mock --set=fixtures/demo` | the prototype quality scenario, see below | 0 pass, 1 a threshold fails |
| `bun run scripts/make-demo-sets.ts` | one line per built-in source set; rewrites `fixtures/demo-sets/*` (placeholder videos, recorded ASR and model answers) | 0 |

State is one JSON file, `out/demo/state.json` or `$DEMO_STATE`. It is read at the start of every request and written atomically after every change. `bun run demo-reset` returns the demo to the start.

## What is where

- `src/demo/server.ts`: the server (`Bun.serve`, host `127.0.0.1`, port from `$PORT`), the React app comes from `src/demo/ui/`.
- `src/demo/api.ts`: all API routes; every body is validated with strict zod schemas (`schemas.ts`), at most 8 KB.
- `src/demo/domain/`: the rules in plain functions without HTTP: marks, editing and locks, approval, export (text, DOCX, ZIP), directory, views. Tests call them directly.
- `src/demo/seed.ts`, `src/demo/sets.ts`: the seed and the built-in invented source sets (`fixtures/demo/story-1` and `fixtures/demo-sets/*`).
- `src/core`, `src/adapters`, `src/pipeline`, `scripts/quality.ts`: the prototype below, reused as it is.

The demo does not do: file upload, real models, passwords, directory table upload (a line says it comes in the first version), real video (a fake player shows the time and the transcript text).

# Core prototype

Mock models only. No database, no network, no paid calls. Bun only.

```
bun install
bun run test
bun run typecheck
bun run quality --models=mock --set=fixtures/demo
bun run quality --models=real --set=fixtures/demo
bun run quality --models=mock --set=fixtures/demo --print-mock-keys
```

| Command | Prints | Exit |
|---------|--------|------|
| `bun install` | installed packages | 0 |
| `bun run test` | `bun test` summary: pass and fail counts | 0 when all pass |
| `bun run typecheck` | nothing when clean (`tsc --noEmit`) | 0 |
| `bun run quality --models=mock --set=<dir>` | per story: `linkedShare`, `recall`, `falseFlagShare`, `ms`, `costRub`, `injection clean/LEAKED`; then `total recall` and `total injectionFailures` with their thresholds; the two files written | 0 pass, 1 a threshold fails |
| `bun run quality --models=real ...` | `Настоящие модели ещё не подключены` | 2 |
| `... --print-mock-keys` | the `asr/<sha256>.json` and `llm/<sha256>.json` names each story needs, and whether the ASR ones exist | 0 |

Options of `quality`: `--seed=N` (review sheet sample, default 1), `--out=<dir>` (default `out/quality`).
It writes `report.json` and `review-sheet.csv` there. The sheet (UTF-8 BOM, CRLF; columns story, fact, quote, place; up to 50 random linked facts) is for the human precision check.

Thresholds from the Brief: `recall >= 0.95`, injection failures `= 0`.

## What is here

- `src/core`: types, `normalize`, `extractNumbers`, `verifyFact` and `verifySentence`, zod draft schemas, the Russian text catalog (`failures.ts`, the only place for user-facing texts).
- `src/adapters`: ASR and draft-model interfaces; mocks that replay recordings keyed by content hash; the request builder (`prompt.ts`: instructions apart from material).
- `src/pipeline/run-story.ts`: `runStory(dir, { asr, model })`.
- `scripts/quality.ts`: the quality scenario.
- `fixtures/demo/story-1`: invented story, placeholder "video" files, recordings, labels. See its README.

A story directory holds `story.json` (`{ title, videos, docs }`), the files it names, and optionally `labels.json` and `injection.json`. The mock answers only for material it has recordings for. Anything else fails with `Заглушка знает только демо-исходники. Включите настоящие модели`.

Limits: ordinal numbers (`двадцать шестом`) are not converted and void the number. Word-level confidence comes with the real providers. Directory lookup of names and places is not here.
