import { E } from '../texts.ts';
import { DemoError, type Ctx, type Kind, type JournalRow, type State, type Story } from './types.ts';

export function addJournal(
  state: State,
  ctx: Ctx,
  story: Pick<Story, 'id' | 'title'>,
  action: string,
  o: { draft?: Kind; detail?: string; factText?: string } = {},
): JournalRow {
  const row: JournalRow = {
    id: ++state.seq,
    at: ctx.now,
    userId: ctx.user.id,
    userName: ctx.user.name,
    action,
    storyId: story.id,
    storyTitle: story.title,
    ...o,
  };
  state.journal.push(row);
  return row;
}

export function findStory(state: State, id: string): Story {
  const s = state.stories.find((x) => x.id === id);
  if (!s) throw new DemoError(404, E.noStory);
  return s;
}
