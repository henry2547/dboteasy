/**
 * One Market Scanner result, with the bot it can load.
 *
 * The scanner's own digits decide *which* template the row offers
 * (`matchFreeBotSetup`), so a result can never hand a different strategy to the
 * Bot Builder than the one it displayed. Loading re-targets the template XML at
 * the scanned market and opens the Bot Builder; it places no trade.
 */

import { useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { formatPercent } from '@/pages/digits/format';
import type { MarketScan } from '@/pages/digits/scan-markets';
import { botLoaderStore } from '../bot-loader-store';
import { supportsDigitContracts } from '../market-support';
import { matchFreeBotSetup } from '../scanner-match';
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

const ScannerBotResult = observer(({ result, selected, onPick, onLoaded }: ScannerBotResultProps) => {
    const loader = useFreeBotLoader();
    const setup = useMemo(() => matchFreeBotSetup(result.digits), [result.digits]);
    const template = setup ? freeBotById(setup.templateId) : null;
    const support = supportsDigitContracts(result.market);

    const isThisMarket = loader.bot?.market.symbol === result.market.apiSymbol;
    const loadingThis = loader.loading && isThisMarket;
    const errorThis =
        isThisMarket && (loader.status === 'error' || loader.status === 'invalid')
            ? loader.bot?.errorMessage ?? null
            : null;

    const statusLabel = !setup
        ? 'Sample too small'
        : setup.ready
          ? setup.armed
              ? 'Armed'
              : 'Waiting for entry tick'
          : 'No setup';
    const statusTone = !setup || !setup.ready ? 'idle' : setup.armed ? 'ok' : 'waiting';

    // Only a confirmed setup may load: a row whose conditions do not hold is
    // shown with its evidence but never forced onto a template by its score.
    const blockedReason = !template
        ? 'Not enough scanned ticks to choose a template.'
        : !setup.ready
          ? 'The scanner has not confirmed an Over 1 or Under 8 setup on this market — no matching template to load.'
          : !support.supported
            ? support.reason
            : loader.isRunning
              ? 'A bot is already running — stop it before loading another one.'
              : loader.loading
                ? 'Another bot is still loading.'
                : '';
    const canLoad = !!template && setup.ready && support.supported && !loader.loading && !loader.isRunning;

    const handleLoad = () => {
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

            {setup && template ? (
                <>
                    <div className='scanner-bot__strategy'>
                        <span className='scanner-bot__chip scanner-bot__chip--strategy'>{setup.strategyLabel}</span>
                        <span className='scanner-bot__chip'>
                            {template.contractType} · {setup.prediction} · {setup.triggerLabel}
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
                        {setup.evidence.map(item => `${item.digit} ${formatPercent(item.percentage, 1)}`).join(' · ')}
                    </p>
                    <p className='scanner-bot__reason'>{setup.reason}</p>

                    {!setup.ready && (
                        <p className='scanner-bot__notice'>
                            Load Bot is disabled: this market does not currently match either shipped template. The
                            conditions above are evidence only, not a prediction of the next tick.
                        </p>
                    )}

                    {errorThis && <p className='scanner-bot__error'>{errorThis}</p>}

                    <button
                        type='button'
                        className='scanner-bot__load'
                        onClick={handleLoad}
                        disabled={!canLoad}
                        title={canLoad ? 'Load this template into the Bot Builder on this market' : blockedReason}
                        aria-label={`Load ${setup.strategyLabel} bot on ${result.market.displayName}`}
                    >
                        {loadingThis ? 'Loading…' : `Load ${setup.strategyLabel} bot`}
                    </button>
                </>
            ) : (
                <p className='scanner-bot__reason'>Not enough scanned ticks to judge a setup on this market.</p>
            )}
        </article>
    );
});

export default ScannerBotResult;
