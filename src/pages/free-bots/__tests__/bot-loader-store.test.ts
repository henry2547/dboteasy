/**
 * The loaded-bot store is the one piece of state the Free Bots page, the
 * scanner panel and the Bot Builder banner share. These tests pin the
 * transitions the "Start bot" control relies on: a bot is only `validated`
 * after a successful validation with zero errors, and a failed load is never
 * presented as ready.
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
jest.mock('@/xml/even_odd_window.xml', () => '', { virtual: true });

import { botLoaderStore } from '../bot-loader-store';
import { freeBotById } from '../templates';

const template = freeBotById('over1_entry_every_time')!;

const request = () => ({
    template,
    market: {
        symbol: 'R_100',
        displayName: 'Volatility 100 Index',
        market: 'synthetic_index',
        submarket: 'random_index',
    },
    marketSource: 'library' as const,
    marketSupported: true,
    marketSupportReason: 'R_100 offers Digit Over/Under.',
    accountMode: 'Demo' as const,
    loginid: 'VRTC123',
});

describe('botLoaderStore', () => {
    beforeEach(() => {
        botLoaderStore.clear();
    });

    it('starts idle with no bot', () => {
        expect(botLoaderStore.status).toBe('idle');
        expect(botLoaderStore.bot).toBeNull();
        expect(botLoaderStore.hasBot).toBe(false);
    });

    it('is neither loading nor validated while a load is in flight', () => {
        botLoaderStore.beginLoad(request());

        expect(botLoaderStore.status).toBe('loading');
        expect(botLoaderStore.loading).toBe(true);
        expect(botLoaderStore.validated).toBe(false);
        expect(botLoaderStore.bot?.market.symbol).toBe('R_100');
    });

    it('records the live workspace facts on a successful load', () => {
        botLoaderStore.beginLoad(request());
        botLoaderStore.completeLoad(
            { symbol: 'R_100', contractType: 'DIGITOVER', prediction: '1', predictionIsVariable: false, blockCount: 24 },
            'Demo',
            'VRTC123'
        );

        expect(botLoaderStore.status).toBe('loaded');
        expect(botLoaderStore.bot?.workspaceSymbol).toBe('R_100');
        expect(botLoaderStore.bot?.workspaceBlockCount).toBe(24);
        expect(botLoaderStore.validated).toBe(false);
    });

    it('treats a structured failure as not ready', () => {
        botLoaderStore.beginLoad(request());
        botLoaderStore.failLoad('Unsupported block type(s): mystery_block.');

        expect(botLoaderStore.status).toBe('error');
        expect(botLoaderStore.loadErrorMessage).toBe('Unsupported block type(s): mystery_block.');
        expect(botLoaderStore.validated).toBe(false);
    });

    it('only becomes validated when validation reports no errors', () => {
        botLoaderStore.beginLoad(request());
        botLoaderStore.completeLoad(
            { symbol: 'R_100', contractType: 'DIGITOVER', prediction: '1', predictionIsVariable: false, blockCount: 24 },
            'Demo',
            'VRTC123'
        );

        botLoaderStore.setValidation(
            [{ id: 'account', label: 'Deriv account authorized', passed: false, detail: 'Not signed in' }],
            ['Log in with your Deriv account before running a bot.'],
            null
        );
        expect(botLoaderStore.validated).toBe(false);

        botLoaderStore.setValidation(
            [{ id: 'account', label: 'Deriv account authorized', passed: true, detail: 'Demo · VRTC123' }],
            [],
            null
        );
        expect(botLoaderStore.validated).toBe(true);
    });

    it('clears the loaded bot and every message', () => {
        botLoaderStore.beginLoad(request());
        botLoaderStore.failLoad('boom');
        botLoaderStore.setStartError('still not running');

        botLoaderStore.clear();

        expect(botLoaderStore.status).toBe('idle');
        expect(botLoaderStore.bot).toBeNull();
        expect(botLoaderStore.startError).toBeNull();
    });
});
