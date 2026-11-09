// The same CLI with cli-agent-mode: actions return data, errors carry a code and a suggestion.
import { Command } from 'commander';
import { AgentError, agentMode, run } from 'cli-agent-mode';
import { open, type Note } from './store.ts';

const { db, save } = open('after');
const line = (n: Note) => `#${n.id}  [${n.done ? 'x' : ' '}]  ${n.title}${n.tag ? `  (${n.tag})` : ''}`;

const program = agentMode(new Command('notes'), {
  // Humans get the same text as before; agents (or --json) get the raw data.
  formatHuman: (data) => {
    if (Array.isArray(data)) return data.length ? (data as Note[]).map(line).join('\n') : 'No notes.';
    if (data && typeof data === 'object' && 'title' in data) return line(data as Note);
    if (data && typeof data === 'object' && 'deleted' in data) return `Deleted #${(data as { deleted: number }).deleted}`;
    return typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  },
}).description('Tiny notes CLI');

const find = (id: string) => {
  const n = db.notes.find((x) => x.id === Number(id));
  if (!n) {
    throw new AgentError('NOTE_NOT_FOUND', `Note ${id} not found`, {
      suggestion: 'Run "notes list" to see existing ids.',
      details: { id },
    });
  }
  return n;
};

program
  .command('add')
  .description('add a note')
  .argument('<title>', 'note title')
  .option('-t, --tag <tag>', 'tag')
  .action((title: string, o: { tag?: string }) => {
    const note: Note = { id: db.next++, title, tag: o.tag ?? null, done: false };
    db.notes.push(note);
    save();
    return note;
  });

program
  .command('list')
  .description('list notes')
  .option('-t, --tag <tag>', 'filter by tag')
  .action((o: { tag?: string }) => db.notes.filter((n) => !o.tag || n.tag === o.tag));

program
  .command('done')
  .description('mark a note as done')
  .argument('<id>', 'note id')
  .action((id: string) => {
    const n = find(id);
    n.done = true;
    save();
    return n;
  });

program
  .command('rm')
  .description('delete a note')
  .argument('<id>', 'note id')
  .option('--force', 'delete even if not done')
  .action((id: string, o: { force?: boolean }) => {
    const n = find(id);
    if (!n.done && !o.force) {
      throw new AgentError('NOTE_NOT_DONE', `Note ${id} is not done yet`, {
        suggestion: `Mark it done first ("notes done ${id}") or pass --force.`,
        details: { id: n.id, title: n.title },
      });
    }
    db.notes = db.notes.filter((x) => x !== n);
    save();
    return { deleted: n.id };
  });

await run(program);
