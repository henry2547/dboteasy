/**
 * Import reliability: the loader must refuse an unparsable or unsupported
 * file *before* anything reaches the workspace, report exactly which block it
 * cannot generate, and never alter a template's logic when the market is
 * swapped.
 */

import fs from 'fs';
import path from 'path';

jest.mock('@/xml/over1_entry_every_time.xml', () => '', { virtual: true });
jest.mock('@/xml/under8_entry_every_time.xml', () => '', { virtual: true });
jest.mock('@/xml/over1_two_low_digits.xml', () => '', { virtual: true });
jest.mock('@/xml/under8_two_high_digits.xml', () => '', { virtual: true });
jest.mock('@/xml/over2_three_low_digits.xml', () => '', { virtual: true });
jest.mock('@/xml/under7_rare_nine.xml', () => '', { virtual: true });

import { applyMarketToXml, inspectFreeBotXml, parseBotXml, readMarketFromXml } from '../bot-xml';
import { freeBotById } from '../templates';

const repo_root = path.resolve(__dirname, '../../../..');
const over1 = freeBotById('over1_entry_every_time')!;
const xmlOf = (template = over1) =>
    fs.readFileSync(path.join(repo_root, 'src/xml', template.asset), 'utf8');
const isKnown = () => true;

describe('parseBotXml', () => {
    it('rejects malformed XML with a readable reason', () => {
        const result = parseBotXml('<xml><block></xml>');

        expect(result.doc).toBeNull();
        expect(result.error).toMatch(/not well formed|could not be parsed/i);
    });

    it('rejects an empty asset', () => {
        expect(parseBotXml('').error).toBe('The template XML is empty.');
    });
});

describe('inspectFreeBotXml', () => {
    it('reports an unsupported block type instead of dropping it', () => {
        const xml = xmlOf().replace(
            '<block type="last_digit" id="freebot-over1-entry-digit"></block>',
            '<block type="mystery_digit_block" id="freebot-over1-entry-digit"></block>'
        );
        const report = inspectFreeBotXml(xml, over1, type => type !== 'mystery_digit_block');

        expect(report.ok).toBe(false);
        expect(report.unsupportedTypes).toEqual(['mystery_digit_block']);
        expect(report.errors.join(' ')).toContain('mystery_digit_block');
        // The block is still in the parsed document — nothing was deleted.
        expect(xml).toContain('mystery_digit_block');
    });

    it('fails an entry condition that does not match the template', () => {
        const xml = xmlOf().replace(
            '<field name="OP">LTE</field>',
            '<field name="OP">GTE</field>'
        );
        const report = inspectFreeBotXml(xml, over1, isKnown);

        expect(report.ok).toBe(false);
        expect(report.errors.join(' ')).toContain('Entry condition mismatch');
    });

    it('fails a template whose variable references do not resolve', () => {
        const xml = xmlOf().replace(
            '<field name="VAR" id="freebot-stake" variabletype="">freebot:stake</field>',
            '<field name="VAR" id="undeclared-var" variabletype="">freebot:undeclared</field>'
        );
        const report = inspectFreeBotXml(xml, over1, isKnown);

        expect(report.ok).toBe(false);
        expect(report.missingVariables).toContain('undeclared-var');
    });
});

describe('applyMarketToXml', () => {
    it('changes only the market fields and keeps the bot logic intact', () => {
        const templateXml = xmlOf();
        const before = inspectFreeBotXml(templateXml, over1, isKnown);
        const patched = applyMarketToXml(templateXml, {
            symbol: '1HZ75V',
            market: 'synthetic_index',
            submarket: 'random_index',
        });

        expect(patched.error).toBeNull();
        expect(patched.changed).toContain('SYMBOL_LIST');

        const after = inspectFreeBotXml(patched.xml, over1, isKnown);
        expect(after.ok).toBe(true);
        expect(readMarketFromXml(patched.xml)?.symbol).toBe('1HZ75V');

        // Everything except the symbol is untouched.
        expect(after.settings.contractType).toBe(before.settings.contractType);
        expect(after.settings.prediction).toBe(before.settings.prediction);
        expect(after.settings.duration).toBe(before.settings.duration);
        expect(after.settings.durationType).toBe(before.settings.durationType);
        expect(after.settings.stake).toBe(before.settings.stake);
        expect(after.settings.entryOperator).toBe(before.settings.entryOperator);
        expect(after.settings.triggerDigit).toBe(before.settings.triggerDigit);
        expect(after.settings.multiplier).toBe(before.settings.multiplier);
        expect(after.settings.takeProfit).toBe(before.settings.takeProfit);
        expect(after.settings.stopLoss).toBe(before.settings.stopLoss);
        expect(after.blockCount).toBe(before.blockCount);
    });

    it('refuses to re-target without a symbol', () => {
        const patched = applyMarketToXml(xmlOf(), { symbol: '  ' });
        expect(patched.error).toBe('No market symbol was supplied.');
    });
});
