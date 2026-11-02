import { isObserverProgramRoot, isStrayTopBlock } from '../index';

const MAIN = ['trade_definition', 'before_purchase', 'during_purchase', 'after_purchase'];
const INDEPENDENT = ['block_holder', 'loader', 'procedures_defnoreturn'];

const block = type => ({
    type,
    isMainBlock: () => MAIN.includes(type),
    isIndependentBlock: () => INDEPENDENT.includes(type),
});

describe('the run-time stray-block sweep', () => {
    it('leaves every observer program root enabled', () => {
        ['obs_on_start', 'obs_on_tick', 'obs_on_window', 'obs_entry', 'obs_note'].forEach(type => {
            expect(isObserverProgramRoot(block(type))).toBe(true);
            expect(isStrayTopBlock(block(type))).toBe(false);
        });
    });

    it('keeps the trade definition and independent blocks enabled', () => {
        [...MAIN, ...INDEPENDENT].forEach(type => expect(isStrayTopBlock(block(type))).toBe(false));
    });

    it('still disables a genuinely stray block', () => {
        ['notify', 'math_number', 'variables_set'].forEach(type => expect(isStrayTopBlock(block(type))).toBe(true));
    });
});
