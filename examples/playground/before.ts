// A typical commander CLI: human text output, errors via console.error + process.exit(1).
import { Command } from 'commander';
import { open } from './store.ts';

const { db, save } = open('before');
const program = new Command('notes').description('Tiny notes CLI');

program
  .command('add')
  .description('add a note')
  .argument('<title>', 'note title')
  .option('-t, --tag <tag>', 'tag')
  .action((title: string, o: { tag?: string }) => {
    const id = db.next++;
    db.notes.push({ id, title, tag: o.tag ?? null, done: false });
    save();
    console.log(`Added note #${id}: ${title}`);
  });

program
  .command('list')
  .description('list notes')
  .option('-t, --tag <tag>', 'filter by tag')
  .action((o: { tag?: string }) => {
    const rows = db.notes.filter((n) => !o.tag || n.tag === o.tag);
    if (!rows.length) return console.log('No notes.');
    for (const n of rows) console.log(`#${n.id}  [${n.done ? 'x' : ' '}]  ${n.title}${n.tag ? `  (${n.tag})` : ''}`);
  });

program
  .command('done')
  .description('mark a note as done')
  .argument('<id>', 'note id')
  .action((id: string) => {
    const n = db.notes.find((x) => x.id === Number(id));
    if (!n) {
      console.error(`Note ${id} not found`);
      process.exit(1);
    }
    n.done = true;
    save();
    console.log(`Done #${id}`);
  });

program
  .command('rm')
  .description('delete a note')
  .argument('<id>', 'note id')
  .option('--force', 'delete even if not done')
  .action((id: string, o: { force?: boolean }) => {
    const n = db.notes.find((x) => x.id === Number(id));
    if (!n) {
      console.error(`Note ${id} not found`);
      process.exit(1);
    }
    if (!n.done && !o.force) {
      console.error('Refusing to delete an unfinished note.');
      process.exit(1);
    }
    db.notes = db.notes.filter((x) => x !== n);
    save();
    console.log(`Deleted #${id}`);
  });

program.parse();
