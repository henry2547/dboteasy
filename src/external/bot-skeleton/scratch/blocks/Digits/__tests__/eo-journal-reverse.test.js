/**
 * The standalone Even/Odd entry reads only its configured run length and hands
 * the parity decision to the trade engine. It has no Over/Under primary leg or
 * recovery fields; execution uses the selected market's genuine tick stream.
 */
const loadGenerator = () => {
    window.Blockly = {
        Blocks: {},
        Colours: { Base: { colour: '#000', colourSecondary: '#111', colourTertiary: '#222' } },
        Categories: { Digits: 'digits' },
        JavaScript: { javascriptGenerator: { forBlock: {} } },
    };
    jest.isolateModules(() => {
        require('../eo_journal_reverse');
    });
    return window.Blockly.JavaScript.javascriptGenerator.forBlock.eo_journal_reverse;
};

const blockWith = fields => ({
    getFieldValue: name => fields[name],
});

describe('standalone Even/Odd last-digits block', () => {
    const generate = loadGenerator();

    it.each([2, 3, 4])('generates one standalone parity entry for a run of %i digits', run => {
        expect(generate(blockWith({ RUN: run }))).toBe(`Bot.eoJournalReverse(${run});\n`);
    });

    it('defines a statement block with only the run-length control', () => {
        const definition = window.Blockly.Blocks.eo_journal_reverse.definition();
        expect(definition.previousStatement).toBeNull();
        expect(definition.nextStatement).toBeNull();
        expect(definition.args0).toEqual([
            expect.objectContaining({ name: 'RUN', type: 'field_number', value: 2, min: 2, max: 100 }),
        ]);
        expect(definition.args0.some(arg => ['PRIMARY', 'PARITY', 'REVERSAL'].includes(arg.name))).toBe(false);
        expect(definition.tooltip).toMatch(/not an Over\/Under recovery leg/i);
    });

    it('rejects invalid run lengths', () => {
        expect(() => generate(blockWith({ RUN: 1 }))).toThrow();
        expect(() => generate(blockWith({ RUN: 101 }))).toThrow();
        expect(() => generate(blockWith({ RUN: 'abc' }))).toThrow();
    });
});
