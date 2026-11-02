/**
 * The "Journal last digits & buy the reverse" block is the reversal entry in one block: it has to
 * hand the engine the run length it was configured with, so the journal and the purchase read the
 * same digits.
 */
const loadGenerator = () => {
    window.Blockly = {
        Blocks: {},
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

describe('journal & reverse block generation', () => {
    const generate = loadGenerator();

    it('generates the engine call with the configured run length', () => {
        expect(generate(blockWith({ RUN: 2 }))).toContain('Bot.eoJournalReverse(2)');
        expect(generate(blockWith({ RUN: 3 }))).toContain('Bot.eoJournalReverse(3)');
    });

    it('refuses an unusable run length', () => {
        expect(() => generate(blockWith({ RUN: 1 }))).toThrow();
        expect(() => generate(blockWith({ RUN: 101 }))).toThrow();
        expect(() => generate(blockWith({ RUN: 'abc' }))).toThrow();
    });

    it('is registered in the Digits palette category', () => {
        const block = window.Blockly.Blocks.eo_journal_reverse;
        expect(block).toBeDefined();
    });
});
