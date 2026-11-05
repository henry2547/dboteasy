/**
 * One Market Scanner result, with every bot its digits qualify.
 *
 * `matchFreeBotSetups` returns each bot whose rule the scanned digits satisfy — bot 8 for an Over 1
 * market (digits 0 and 1 at or below 10.2%) and bot 9 for an Under 8 market (digits 8 and 9 at or
 * below 10.2%), in the same row when both hold. A result can therefore never hand a different strategy to the Bot
 * Builder than the one it displayed.
 *
 * Loading re-targets that template's XML at the scanned market and opens the Bot Builder; it places
 * no trade. The backtest walks the scanned ticks with the bot's own gates and reports what it would
 * have done — a measurement, never a promise.
 */

import { useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { formatPercent } from '@/features/digits/format';
import type { MarketScan } from '@/features/digits/scan-markets';
import { backtestColdRunBot, type BotBacktestResult } from '../bot-backtest';
import { botLoaderStore } from '../bot-loader-store';
import { supportsDigitContracts } from '../market-support';
import { matchFreeBotSetups, type FreeBotSetup } from '../scanner-match';
import { freeBotById } from '../templates';
import { useFreeBotLoader } from '../use-free-bot-loader';
import './scanner-bot-result.scss';

interface ScannerBotResultProps {
    result: MarketScan;
    selected: boolean;
    onPick: () => void;
    /** The template reached the workspace, so the scanner panel can close. */
    onLoaded: () => void;
}

function scanClock(scannedAt: number): string {
    try {
        return new Date(scannedAt).toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
        });
    } catch {
        return '—';
    }
}

/** Backtest of one bot over the scanned ticks, computed only when the user asks for it. */
function BotBacktest({ setup, digits }: { setup: FreeBotSetup; digits: number[] }) {
    const [result, set_result] = useState<BotBacktestResult | null>(null);

    const run = () => {
        if (result) {
            set_result(null);
            return;
        }
        set_result(backtestColdRunBot(setup.strategy, digits, { sample: 100, shareCeiling: 10.2 }));
    };

    return (
        <div className='scanner-bot__backtest'>
            <button type='button' className='scanner-bot__backtest-toggle' onClick={run}>
                {result ? 'Hide backtest' : `Backtest bot ${setup.botNumber}`}
            </button>

            {result && (
                <div className='scanner-bot__backtest-body'>
                    {result.entries === 0 ? (
                        <p className='scanner-bot__note'>
                            No entry in these {result.ticks} ticks — the gates never all held, so there is nothing to
                            measure.
                        </p>
                    ) : (
                        <>
                            <dl className='scanner-bot__metrics'>
                                <div>
                                    <dt>Win rate</dt>
                                    <dd>{formatPercent(result.winRate, 1)}</dd>
                                </div>
                                <div>
                                    <dt>Entries</dt>
                                    <dd>{result.entries}</dd>
                                </div>
                                <div>
                                    <dt>W / L</dt>
                                    <dd>
                                        {result.wins} / {result.losses}
                                    </dd>
                                </div>
                                <div>
                                    <dt>Worst run</dt>
                                    <dd>{result.longestLossStreak}L</dd>
                                </div>
                            </dl>
                            <p className='scanner-bot__note'>
                                Walk-forward on {result.ticks} ticks · outcomes read from the next tick · adaptive
                                ceiling averaged {result.averageCeiling?.toFixed(1) ?? '—'}% (from {result.shareCeiling}%).
                            </p>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

const ScannerBotResult = observer(({ result, selected, onPick, onLoaded }: ScannerBotResultProps) => {
    const loader = useFreeBotLoader();
    const setups = useMemo(() => matchFreeBotSetups(result.digits), [result.digits]);
    const support = supportsDigitContracts(result.market);

    const isThisMarket = loader.bot?.market.symbol === result.market.apiSymbol;

    const handleLoad = (setup: FreeBotSetup) => {
        const template = freeBotById(setup.templateId);
        if (!template) return;
        return loader
            .loadBot({
                template,
                market: {
                    symbol: result.market.apiSymbol,
                    displayName: result.market.displayName,
                    market: result.market.market ?? null,
                    submarket: result.market.submarket ?? null,
                },
                marketSource: 'scanner',
                marketSupported: support.supported,
                marketSupportReason: support.reason,
            })
            .then(() => {
                if (botLoaderStore.status === 'loaded') onLoaded();
            });
    };

    return (
        <article className={'scanner-bot' + (selected ? ' scanner-bot--active' : '')}>
            <button type='button' className='scanner-bot__pick' onClick={onPick}>
                <span className='scanner-bot__name'>{result.market.displayName}</span>
                <span className='scanner-bot__symbol'>{result.market.apiSymbol}</span>
                <span className='scanner-bot__meta'>
                    score {result.score} · {result.bestRuleLabel} · {result.digits.length} ticks · scanned{' '}
                    {scanClock(result.scannedAt)}
                </span>
            </button>

            {setups.length === 0 && (
                <p className='scanner-bot__reason'>Not enough scanned ticks to judge a setup on this market.</p>
            )}

            {setups.map(setup => {
                const loadingThis = loader.loading && isThisMarket && loader.bot?.templateId === setup.templateId;
                const errorThis =
                    isThisMarket &&
                    loader.bot?.templateId === setup.templateId &&
                    (loader.status === 'error' || loader.status === 'invalid')
                        ? loader.bot?.errorMessage ?? null
                        : null;

                const statusLabel = !setup.ready
                    ? 'No setup'
                    : setup.armed
                      ? 'Entry armed'
                      : 'Waiting for trigger';
                const statusTone = !setup.ready ? 'idle' : setup.armed ? 'ok' : 'waiting';

                // Only a confirmed setup may load: a row whose conditions do not hold is shown with
                // its evidence but never forced onto a template by its score.
                const blockedReason = !setup.ready
                    ? `The scanned digits do not satisfy bot ${setup.botNumber}'s rule — no matching template to load.`
                    : !support.supported
                      ? support.reason
                      : loader.isRunning
                        ? 'A bot is already running — stop it before loading another one.'
                        : loader.loading
                          ? 'Another bot is still loading.'
                          : '';
                const canLoad = setup.ready && support.supported && !loader.loading && !loader.isRunning;

                return (
                    <div className='scanner-bot__setup' key={setup.templateId}>
                        <div className='scanner-bot__strategy'>
                            <span className='scanner-bot__chip scanner-bot__chip--strategy'>
                                Bot {setup.botNumber} · {setup.strategyLabel}
                            </span>
                            <span className='scanner-bot__chip'>
                                {setup.contractType} · {setup.prediction}
                            </span>
                            <span className={`scanner-bot__chip scanner-bot__chip--${statusTone}`}>{statusLabel}</span>
                        </div>

                        <ul className='scanner-bot__conditions'>
                            {setup.conditions.map(condition => (
                                <li
                                    key={condition.id}
                                    className={
                                        'scanner-bot__condition scanner-bot__condition--' +
                                        (condition.passed ? 'ok' : 'fail')
                                    }
                                >
                                    <span aria-hidden='true'>{condition.passed ? '✓' : '✗'}</span> {condition.label}
                                    <span className='scanner-bot__detail'> — {condition.detail}</span>
                                </li>
                            ))}
                        </ul>

                        <p className='scanner-bot__evidence'>
                            Digit share:{' '}
                            {setup.evidence
                                .map(item => `${item.digit} ${formatPercent(item.percentage, 1)}`)
                                .join(' · ')}
                            {' · '}
                            red bar (optional):{' '}
                            {setup.redBarDigit === null ? 'none on the losing digits' : `digit ${setup.redBarDigit}`}
                            {setup.adaptiveCeiling !== null ? ` · ceiling now ${setup.adaptiveCeiling.toFixed(1)}%` : ''}
                        </p>
                        <p className='scanner-bot__reason'>{setup.reason}</p>

                        {!setup.ready && (
                            <p className='scanner-bot__notice'>
                                Load Bot is disabled: this market does not meet bot {setup.botNumber}&apos;s rule yet.
                                The conditions above are evidence only, not a prediction of the next tick.
                            </p>
                        )}

                        {errorThis && <p className='scanner-bot__error'>{errorThis}</p>}

                        <BotBacktest setup={setup} digits={result.digits} />

                        <button
                            type='button'
                            className='scanner-bot__load'
                            onClick={() => handleLoad(setup)}
                            disabled={!canLoad}
                            title={
                                canLoad
                                    ? 'Load this bot into the Bot Builder on this market'
                                    : blockedReason
                            }
                            aria-label={`Load bot ${setup.botNumber} (${setup.strategyLabel}) on ${result.market.displayName}`}
                        >
                            {loadingThis ? 'Loading…' : `Load bot ${setup.botNumber} · ${setup.strategyLabel}`}
                        </button>
                    </div>
                );
            })}
        </article>
    );
});

export default ScannerBotResult;
