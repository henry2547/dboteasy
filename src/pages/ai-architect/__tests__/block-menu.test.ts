/**
 * The Architect reads the Bot Builder's Blocks menu.
 *
 * `ToolboxItems()` renders the palette exactly as the Bot Builder's toolbox mounts it. Jest maps
 * `react-dom/server` to a stub, so the palette's own markup cannot be rendered here; the parsing
 * that reads it is therefore tested against markup with the palette's shape, and the index itself
 * against the names, categories and groups every menu block is reported by.
 */
import { allBlocks } from '../builder';
import { blocksMenu, menuBlockNamedIn, parseBlocksMenu } from '../block-menu';
import { generateBot } from '../pipeline';
import { buildRegistry, CAPABILITY_CATALOG, fixedProbe } from '../registry';
import type { MenuBlock, Requirement } from '../types';

const registry = buildRegistry(fixedProbe(CAPABILITY_CATALOG.map(entry => entry.type)));

const menuBlockFor = (type: string): MenuBlock | undefined => blocksMenu().find(block => block.type === type);

const usedTypes = (workspace: Parameters<typeof allBlocks>[0]) => [...new Set(allBlocks(workspace).map(block => block.type))];

const requirementFor = (requirements: Requirement[], pattern: RegExp) => requirements.find(item => pattern.test(item.clause));

/** Markup shaped like the real palette: categories, a group with nested categories, nested examples. */
const PALETTE = `<xml xmlns="http://www.w3.org/1999/xhtml" id="toolbox">
    <category id="trade_parameters" name="Trade parameters">
        <block type="trade_definition">
            <statement name="TRADE_OPTIONS">
                <block type="trade_definition_market"><field name="SYMBOL_LIST" /></block>
            </statement>
        </block>
    </category>
    <category id="digits" name="Digits">
        <block type="switch_active_market" />
        <block type="switch_active_market" />
    </category>
    <category id="observer_entry_monitoring" name="Entry &amp; monitoring">
        <category id="observer_entry_monitoring__entry_conditions" name="Entry Conditions">
            <block type="obs_evaluate_over" />
        </category>
    </category>
    <category id="utility" name="Utility">
        <category name="Notifications" id="notifications">
            <block type="notify" />
        </category>
    </category>
</xml>`;

describe('the Blocks menu index', () => {
    it('names every menu block and the category it is shown under', () => {
        expect(blocksMenu().length).toBeGreaterThan(50);
        expect(menuBlockFor('switch_active_market')).toMatchObject({
            label: 'Switch active market',
            category: 'Digits',
            group: null,
        });
        expect(menuBlockFor('purchase')).toMatchObject({ label: 'Purchase', category: 'Purchase conditions' });
        expect(menuBlockFor('digits_frequency')?.category).toBe('Digits');
    });

    it('keeps the observer blocks in their Blocks-menu group', () => {
        const observer = menuBlockFor('obs_evaluate_over');
        expect(observer?.group).toBeTruthy();
        expect(observer?.category).toBeTruthy();
    });

    it('reads the palette markup: groups, nested categories, nested examples, one entry per block', () => {
        const menu = parseBlocksMenu(PALETTE);
        expect(menu.map(block => block.type)).toEqual([
            'trade_definition',
            'trade_definition_market',
            'switch_active_market',
            'obs_evaluate_over',
            'notify',
        ]);
        expect(menu.find(block => block.type === 'switch_active_market')).toMatchObject({
            label: 'Switch active market',
            category: 'Digits',
            group: null,
        });
        expect(menu.find(block => block.type === 'obs_evaluate_over')).toMatchObject({
            label: 'Evaluate Next Tick For Over',
            category: 'Entry Conditions',
            group: 'Entry & monitoring',
        });
        expect(menu.find(block => block.type === 'notify')).toMatchObject({ label: 'Notify', category: 'Notifications' });
    });

    it('recognises a block the prompt names, and stays quiet about anything else', () => {
        expect(menuBlockNamedIn('use the same-digit streak block')?.type).toBe('digits_streak');
        expect(menuBlockNamedIn('use the Digit has no hot / cold bar block on digits 5 and 6')?.type).toBe('digits_bar_neutral');
        expect(menuBlockNamedIn('scan all volatility markets for Over 1, check the last 100 digits')).toBeNull();
    });
});

describe('generation against the Blocks menu', () => {
    it('uses the scan blocks a prompt names from the menu', () => {
        const result = generateBot('Find eligible markets, then trade Over 1 when the last digit is over 1', { registry });

        expect(result.ok).toBe(true);
        const used = usedTypes(result.bot!.workspace);
        expect(used).toContain('switch_active_market');
        expect(used).toContain('market_discover_eligible');

        const named = requirementFor(result.requirements, /find eligible markets/i);
        expect(named?.status).toBe('applied');
        expect(named?.detail).toContain('Find eligible markets');
    });

    it('aligns a filter block the prompt names with the block the bot really places', () => {
        const result = generateBot('Scan all markets for Over 1, use the Digit frequency (%) block: digit 0 above 10%', { registry });

        expect(result.ok).toBe(true);
        expect(usedTypes(result.bot!.workspace)).toContain('digits_frequency');
        const named = requirementFor(result.requirements, /digit frequency/i);
        expect(named?.status).toBe('applied');
        expect(named?.detail).toContain('the generated bot uses this block');
    });

    it('reports a menu block the Architect does not place instead of ignoring it', () => {
        const result = generateBot('Scan all volatility markets for Over 1, then wait for settlement', { registry });

        expect(result.ok).toBe(true);
        expect(usedTypes(result.bot!.workspace)).not.toContain('exec_wait_settlement');
        const named = requirementFor(result.requirements, /wait for settlement/i);
        expect(named?.status).toBe('unsupported');
        expect(named?.detail).toContain('Wait for settlement');
        expect(result.reasoning.join(' ')).toContain('does not place');
    });
});
