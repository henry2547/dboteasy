/**
 * The Builder refuses to run a canvas that is missing a mandatory block. The Even/Odd strategy
 * blocks buy through the engine's own purchase path, so a canvas built from them has no `purchase`
 * block — it must still pass the gate, and a canvas with no entry at all must still fail it.
 */

jest.mock('@/components/bot-notification/bot-notification', () => ({ botNotification: jest.fn() }));
jest.mock('@/components/bot-notification/bot-notification-utils', () => ({ notification_message: {} }));
jest.mock('@/components/shared', () => ({ getCurrencyDisplayCode: value => value }));

import { isAllRequiredBlocksEnabled } from '../index';

const blockOf = type => ({ type, disabled: false, childBlocks_: [] });

const workspaceWith = types => {
    const blocks = types.map(blockOf);
    return { getAllBlocks: () => blocks, getAllBlocksOrdered: blocks };
};

beforeEach(() => {
    window.Blockly = { derivWorkspace: workspaceWith([]) };
});

afterEach(() => {
    delete window.Blockly;
});

const MANDATORY = ['trade_definition_tradeoptions', 'trade_definition', 'before_purchase'];

describe('the mandatory-block gate', () => {
    it('accepts an Even/Odd canvas that buys through the strategy blocks', () => {
        window.Blockly.derivWorkspace = workspaceWith([...MANDATORY, 'eo_buy_even', 'eo_buy_odd']);

        expect(isAllRequiredBlocksEnabled(window.Blockly.derivWorkspace)).toBe(true);
    });

    it('still requires a purchase from an ordinary canvas', () => {
        window.Blockly.derivWorkspace = workspaceWith([...MANDATORY]);

        expect(isAllRequiredBlocksEnabled(window.Blockly.derivWorkspace)).toBe(false);
    });

    it('accepts an ordinary canvas with a purchase block', () => {
        window.Blockly.derivWorkspace = workspaceWith([...MANDATORY, 'purchase']);

        expect(isAllRequiredBlocksEnabled(window.Blockly.derivWorkspace)).toBe(true);
    });
});
