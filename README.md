# news-draft-assistant: core prototype

Mock models only. No UI, no database, no network, no paid calls. Bun only.

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
