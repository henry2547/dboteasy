/**
 * The Multi-Market Digit Entry Hunter templates: generated Blockly XML that
 * carries the real "Switch active market" block, the digit entry gate the
 * strategy needs, and the risk controls the loader inspects.
 */

jest.mock('@/xml/over1_entry_every_time.xml', () => '', { virtual: true });
jest.mock('@/xml/under8_entry_every_time.xml', () => '', { virtual: true });
jest.mock('@/xml/over1_two_low_digits.xml', () => '', { virtual: true });
jest.mock('@/xml/under8_two_high_digits.xml', () => '', { virtual: true });
jest.mock('@/xml/over2_three_low_digits.xml', () => '', { virtual: true });
jest.mock('@/xml/over2_entry_every_time.xml', () => '', { virtual: true });
jest.mock('@/xml/over3_entry_every_time.xml', () => '', { virtual: true });
jest.mock('@/xml/under7_entry_every_time.xml', () => '', { virtual: true });
jest.mock('@/xml/under6_entry_every_time.xml', () => '', { virtual: true });
jest.mock('@/xml/under7_rare_nine.xml', () => '', { virtual: true });
jest.mock('@/xml/even_entry_every_time.xml', () => '', { virtual: true });
jest.mock('@/xml/odd_entry_every_time.xml', () => '', { virtual: true });

import { applyMarketToXml, inspectFreeBotXml, parseBotXml } from '../bot-xml';
import {
    MULTI_MARKET_DEFAULTS,
    MULTI_MARKET_PRESETS,
    buildMultiMarketBotXml,
    multiMarketById,
    multiMarketTemplate,
    validateMultiMarketConfig,
    type MultiMarketConfig,
} from '../multi-market';
import { freeBotById, freeBotXml } from '../templates';

const isKnown = () => true;
const config = (changes: Partial<MultiMarketConfig> = {}): MultiMarketConfig => ({
    ...MULTI_MARKET_DEFAULTS,
    ...changes,
});

describe('validateMultiMarketConfig', () => {
    it('accepts the shipped defaults', () => {
        expect(validateMultiMarketConfig(MULTI_MARKET_DEFAULTS)).toEqual([]);
    });

    it('rejects a barrier outside the contract range', () => {
        expect(validateMultiMarketConfig(config({ strategy: 'over', barrier: 9 })).join(' ')).toContain(
            'between 0 and 8'
        );
        expect(validateMultiMarketConfig(config({ strategy: 'under', barrier: 0 })).join(' ')).toContain(
            'between 1 and 9'
        );
    });

    it('rejects a barrier on a parity strategy', () => {
        expect(validateMultiMarketConfig(config({ strategy: 'even', barrier: 3 })).join(' ')).toContain(
            'takes no barrier digit'
        );
    });

    it('refuses unlimited martingale growth', () => {
        expect(validateMultiMarketConfig(config({ multiplier: 5 })).join(' ')).toContain('between 1');
    });

    it('rejects a negative scan limit and a zero loss limit', () => {
        expect(validateMultiMarketConfig(config({ maxScanCycles: -1 })).join(' ')).toContain('scan cycles');
        expect(validateMultiMarketConfig(config({ maxConsecutiveLosses: 0 })).join(' ')).toContain(
            'consecutive losses'
        );
    });
});

describe('generated workspace', () => {
    it('contains the real Switch active market block with the configured order and condition', () => {
        const parsed = parseBotXml(buildMultiMarketBotXml(config({ strategy: 'over', barrier: 2, maxScanCycles: 6 })));
        const doc = parsed.doc!;

        const switchBlock = doc.querySelector('block[type="switch_active_market"]');
        expect(switchBlock).not.toBeNull();
        expect(switchBlock!.querySelector('field[name="ORDER"]')?.textContent).toBe('round_robin');
        expect(switchBlock!.querySelector('value[name="MAX_SWITCHES"] field[name="NUM"]')?.textContent).toBe('6');
        // The switch waits for the same digit rule the purchase is gated on.
        expect(switchBlock!.querySelector('value[name="CONDITION"] block[type="logic_compare"]')).not.toBeNull();
        expect(switchBlock!.querySelector('value[name="CONDITION"] field[name="OP"]')?.textContent).toBe('LTE');
        expect(switchBlock!.querySelector('value[name="CONDITION"] field[name="NUM"]')?.textContent).toBe('2');
    });

    it('wires Even/Odd and Matches/Differs through their own digit blocks', () => {
        const even = parseBotXml(buildMultiMarketBotXml(config({ strategy: 'even', barrier: null }))).doc!;
        expect(even.querySelector('value[name="CONDITION"] block[type="digits_even_odd"]')).not.toBeNull();
        expect(even.querySelector('field[name="PREDICTION"]')).toBeNull();

        const matches = parseBotXml(buildMultiMarketBotXml(config({ strategy: 'matches', barrier: 7 }))).doc!;
        const block = matches.querySelector('value[name="CONDITION"] block[type="digits_matches_differs"]');
        expect(block?.querySelector('field[name="MODE"]')?.textContent).toBe('matches');
        expect(block?.querySelector('field[name="DIGIT"]')?.textContent).toBe('7');
        expect(matches.querySelector('value[name="PREDICTION"] field[name="NUM"]')?.textContent).toBe('7');
    });

    it('carries the risk controls the loader checks', () => {
        const doc = parseBotXml(buildMultiMarketBotXml(config({ stake: 2, takeProfit: 6, stopLoss: 12 }))).doc!;
        const after = doc.querySelector('block[type="after_purchase"]')!;

        expect(after.querySelector('block[type="trade_again"]')).not.toBeNull();
        expect(after.querySelector('block[type="contract_check_result"]')).not.toBeNull();
        expect(doc.querySelector('block[type="trade_definition_tradeoptions"] field[name="CURRENCY_LIST"]')?.textContent).toBe(
            'USD'
        );
        expect(doc.querySelector('block[type="trade_definition"] statement[name="INITIALIZATION"]')).not.toBeNull();
    });
});

describe('templates', () => {
    it('generates one loadable template per preset', () => {
        expect(MULTI_MARKET_PRESETS).toHaveLength(8);

        for (const preset of MULTI_MARKET_PRESETS) {
            const template = multiMarketTemplate(preset.config);
            const report = inspectFreeBotXml(freeBotXml(template), template, isKnown);

            expect(report.errors).toEqual([]);
            expect(report.ok).toBe(true);
            expect(report.blockTypes).toContain('switch_active_market');
        }
    });

    it('maps each preset to the expected contract and digit', () => {
        const contractOf = (id: string) => {
            const preset = MULTI_MARKET_PRESETS.find(item => item.id === id)!;
            return multiMarketTemplate(preset.config);
        };

        expect(contractOf('over_1')).toMatchObject({ contractType: 'DIGITOVER', prediction: 1, tradeType: 'overunder' });
        expect(contractOf('over_2')).toMatchObject({ contractType: 'DIGITOVER', prediction: 2 });
        expect(contractOf('under_8')).toMatchObject({ contractType: 'DIGITUNDER', prediction: 8 });
        expect(contractOf('under_7')).toMatchObject({ contractType: 'DIGITUNDER', prediction: 7 });
        expect(contractOf('even')).toMatchObject({ contractType: 'DIGITEVEN', prediction: null, entryParity: 'even' });
        expect(contractOf('odd')).toMatchObject({ contractType: 'DIGITODD', prediction: null, entryParity: 'odd' });
        expect(contractOf('matches')).toMatchObject({
            contractType: 'DIGITMATCH',
            prediction: 5,
            tradeType: 'matchesdiffers',
        });
        expect(contractOf('differs')).toMatchObject({ contractType: 'DIGITDIFF', prediction: 4 });
    });

    it('keeps the generated template resolvable by id after a load', () => {
        const template = multiMarketTemplate(config({ strategy: 'under', barrier: 6, maxScanCycles: 3 }));

        expect(freeBotById(template.id)).toBe(template);
        expect(multiMarketById(template.id)?.contractType).toBe('DIGITUNDER');
    });

    it('survives an XML export and re-import with the same settings', () => {
        const template = multiMarketTemplate(config({ strategy: 'matches', barrier: 3 }));
        const exported = freeBotXml(template);
        const parsed = parseBotXml(exported);
        const roundTrip = new XMLSerializer().serializeToString(parsed.doc!);

        const first = inspectFreeBotXml(exported, template, isKnown);
        const second = inspectFreeBotXml(roundTrip, template, isKnown);

        expect(second.ok).toBe(true);
        expect(second.blockCount).toBe(first.blockCount);
        expect(second.settings.prediction).toBe('3');
        expect(second.settings.contractType).toBe('DIGITMATCH');
    });

    it('re-targets the market without touching the strategy', () => {
        const template = multiMarketTemplate(config({ strategy: 'over', barrier: 2 }));
        const patched = applyMarketToXml(freeBotXml(template), {
            symbol: 'R_75',
            market: 'synthetic_index',
            submarket: 'random_index',
        });
        const report = inspectFreeBotXml(patched.xml, template, isKnown);

        expect(patched.error).toBeNull();
        expect(report.settings.symbol).toBe('R_75');
        expect(report.settings.prediction).toBe('2');
        expect(report.blockTypes).toContain('switch_active_market');
        expect(report.ok).toBe(true);
    });
});
