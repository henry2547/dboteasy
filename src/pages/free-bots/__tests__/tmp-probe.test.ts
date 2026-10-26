import fs from 'fs';
import path from 'path';
jest.mock('@/xml/even_odd_window.xml', () => '', { virtual: true });
jest.mock('@/xml/over4_five_hot.xml', () => '', { virtual: true });
import { inspectFreeBotXml } from '../bot-xml';
import { FREE_BOT_TEMPLATES } from '../templates';

const repo_root = path.resolve(__dirname, '../../../..');
const blocks_root = path.join(repo_root, 'src/external/bot-skeleton/scratch/blocks');
function registeredBlockTypes(): Set<string> {
    const types = new Set<string>();
    const walk = (dir: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.name.endsWith('.js')) {
                const source = fs.readFileSync(full, 'utf8');
                for (const match of source.matchAll(/window\.Blockly\.Blocks\.([A-Za-z0-9_]+)\s*=/g)) types.add(match[1]);
            }
        }
    };
    walk(blocks_root);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const catalog = require('@/external/bot-skeleton/scratch/blocks/Observer/observer-catalog');
    (catalog.BLOCKS as { type: string }[]).forEach(spec => types.add(spec.type));
    return types;
}
it('probe', () => {
    const known = registeredBlockTypes();
    const out: Record<string, string[]> = {};
    for (const t of FREE_BOT_TEMPLATES) {
        const xml = fs.readFileSync(path.join(repo_root, 'src/xml', t.asset), 'utf8');
        const report = inspectFreeBotXml(xml, t, ty => known.has(ty));
        out[t.id] = report.errors;
    }
    console.log(JSON.stringify(out, null, 1));
});
