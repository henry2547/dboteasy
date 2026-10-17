/**
 * AI Market Scanner — continuously evaluates all eligible volatility markets
 * and ranks them by a transparent, configurable scoring method.
 *
 * For every market it calculates digit frequency, deviations, stability,
 * transitions, pairs, pattern confirmations, and historical observational
 * outcomes. It then checks each enabled strategy's conditions and produces a
 * ranking with the measurements and reasons behind it.
 *
 * The scanner uses its own short-lived public WebSocket per scan cycle so it
 * never disturbs the live market-data subscription. It never fabricates data;
 * if no market qualifies it returns an empty qualifying set.
 */

import { DerivPublicWebSocketClient, type DerivMessage } from '../digits/deriv-public-ws';
import { filterDigitMarkets, normalizeActiveSymbols } from '../digits/markets';
import { extractLastDigit, formatQuote, resolvePrecision } from '../digits/precision';
import { analyzeMarket, patternConfirmed } from './analysis-engine';
import type { MarketAnalysis, MarketRanking, ScannerConfig, ScannerConditionResult, StrategyConfig } from './types';

const SCAN_TICKS = 200;
const MIN_TICKS = 30;
const REQUEST_TIMEOUT_MS = 9000;

export interface ScannerTickData {
    symbol: string;
    displayName: string;
    category: string;
    isOpen: boolean;
    digits: number[];
    lastTickAt: number | null;
}

// ── WebSocket helpers (own short-lived connection per scan) ─────────────────

function openClient(client: DerivPublicWebSocketClient): Promise<void> {
    return new Promise((resolve, reject) => {
        let settled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        let off = () => {};

        const finish = (error?: Error) => {
            if (settled) return;
            settled = true;
            if (timer) clearTimeout(timer);
            off();
            if (error) reject(error);
            else resolve();
        };

        timer = setTimeout(() => finish(new Error('Could not reach the market feed in time.')), REQUEST_TIMEOUT_MS);
        off = client.onStatus(state => {
            if (state.status === 'connected') finish();
            else if (state.status === 'error') finish(new Error(state.errorMessage ?? 'The market feed failed.'));
        });
        client.connect();
    });
}

function request(client: DerivPublicWebSocketClient, payload: Record<string, unknown>): Promise<DerivMessage> {
    return new Promise((resolve, reject) => {
        let settled = false;
        const reqId = client.send(payload);

        const finish = (error?: Error, message?: DerivMessage) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            off();
            if (error) reject(error);
            else resolve(message as DerivMessage);
        };

        const timer = setTimeout(
            () => finish(new Error(`Timed out waiting for ${Object.keys(payload)[0]}`)),
            REQUEST_TIMEOUT_MS
        );

        const off = client.onMessage(message => {
            if (message.req_id !== reqId) return;
            const error = (message as Record<string, any>).error;
            if (error) finish(new Error(String(error.message ?? 'Request failed')));
            else finish(undefined, message);
        });
    });
}

function digitsFromHistory(message: DerivMessage, pipSize: number | null): number[] {
    const payload = message as Record<string, any>;
    const history = payload.history ?? {};
    const prices: unknown[] = Array.isArray(history.prices) ? history.prices : [];

    const resolved = resolvePrecision({
        historyPipSize: payload.pip_size ?? null,
        livePipSize: null,
        activeSymbolPipSize: pipSize,
    });
    const decimalPlaces = resolved.resolvedDecimalPlaces;
    if (decimalPlaces === null) return [];

    const digits: number[] = [];
    prices.forEach(price => {
        const value = Number(price);
        if (!Number.isFinite(value)) return;
        try {
            digits.push(extractLastDigit(formatQuote(value, decimalPlaces)));
        } catch {
            /* skip unparseable price */
        }
    });
    return digits;
}

// ── Strategy condition evaluation ────────────────────────────────────────────

/**
 * Evaluate whether a strategy's conditions are satisfied by the market
 * analysis. Returns the conditions that passed and failed, plus the proposed
 * digit/barrier if the strategy qualifies.
 *
 * This is the DETERMINISTIC strategy engine — it decides whether configured
 * conditions are met. The AI scanner only ranks and explains; it never
 * overrides these checks.
 */
export function evaluateStrategyConditions(
    analysis: MarketAnalysis,
    strategy: StrategyConfig,
    config: ScannerConfig
): { passed: ScannerConditionResult[]; failed: ScannerConditionResult[]; proposedDigit: number | null; proposedBarrier: string | null; reason: string } {
    const passed: ScannerConditionResult[] = [];
    const failed: ScannerConditionResult[] = [];
    const digits = analysis.frequencies;

    // Data quality check
    if (analysis.sampleSize < config.minSampleSize) {
        failed.push({
            id: 'sample-size',
            label: 'Sample size',
            passed: false,
            detail: `${analysis.sampleSize} ticks < minimum ${config.minSampleSize}`,
            value: `${analysis.sampleSize}`,
        });
    } else {
        passed.push({
            id: 'sample-size',
            label: 'Sample size',
            passed: true,
            detail: `${analysis.sampleSize} ticks ≥ minimum ${config.minSampleSize}`,
            value: `${analysis.sampleSize}`,
        });
    }

    // Feed freshness
    if (!analysis.feedFresh) {
        failed.push({
            id: 'feed-fresh',
            label: 'Feed freshness',
            passed: false,
            detail: 'Market feed is stale or interrupted',
            value: 'stale',
        });
    } else {
        passed.push({
            id: 'feed-fresh',
            label: 'Feed freshness',
            passed: true,
            detail: 'Market feed is live and recent',
            value: 'fresh',
        });
    }

    let proposedDigit: number | null = null;
    let proposedBarrier: string | null = strategy.barrier;
    let reason = '';

    switch (strategy.id) {
        case 'over1': {
            // Over 1: digits 0 and 1 should be at or below 10% (stable floor).
            const d0 = digits.find(d => d.digit === 0);
            const d1 = digits.find(d => d.digit === 1);
            const maxLow = Math.max(d0?.percentage ?? 0, d1?.percentage ?? 0);
            const maxLowDev = Math.max(d0?.absoluteDeviation ?? 0, d1?.absoluteDeviation ?? 0);

            if (maxLow <= 10 + config.minDeviationEdge) {
                passed.push({
                    id: 'over1-floor',
                    label: 'Over 1 floor',
                    passed: true,
                    detail: `Digits 0–1 max ${maxLow.toFixed(1)}% (≤ ${10 + config.minDeviationEdge}%)`,
                    value: `${maxLow.toFixed(1)}%`,
                });
            } else {
                failed.push({
                    id: 'over1-floor',
                    label: 'Over 1 floor',
                    passed: false,
                    detail: `Digits 0–1 max ${maxLow.toFixed(1)}% > ${10 + config.minDeviationEdge}%`,
                    value: `${maxLow.toFixed(1)}%`,
                });
            }

            // Pattern confirmation: "00 → 0" or "11 → 0" means last two digits form the pattern.
            const patternHit = config.patternOver1.some(p => patternConfirmed(analysisToDigits(analysis), p));
            if (patternHit) {
                passed.push({
                    id: 'pattern',
                    label: 'Pattern confirmation',
                    passed: true,
                    detail: `Pattern detected at latest ticks`,
                    value: 'confirmed',
                });
            }

            // Observational win-rate for the patterns.
            for (const p of config.patternOver1) {
                const wr = analysis.observationalWinRates[`${p}→Over1`];
                if (wr !== null && wr !== undefined) {
                    if (wr >= 50) {
                        passed.push({
                            id: `obs-${p}`,
                            label: `Historical ${p}→Over1`,
                            passed: true,
                            detail: `${wr.toFixed(1)}% win-rate over observations`,
                            value: `${wr.toFixed(1)}%`,
                        });
                    } else {
                        failed.push({
                            id: `obs-${p}`,
                            label: `Historical ${p}→Over1`,
                            passed: false,
                            detail: `${wr.toFixed(1)}% win-rate (below 50%)`,
                            value: `${wr.toFixed(1)}%`,
                        });
                    }
                }
            }

            proposedBarrier = '1';
            reason = `Over 1: floor at ${maxLow.toFixed(1)}%, ${patternHit ? 'pattern confirmed' : 'no pattern yet'}`;
            break;
        }

        case 'under8': {
            // Under 8: digits 8 and 9 should be at or below 10% (stable ceiling).
            const d8 = digits.find(d => d.digit === 8);
            const d9 = digits.find(d => d.digit === 9);
            const maxHigh = Math.max(d8?.percentage ?? 0, d9?.percentage ?? 0);

            if (maxHigh <= 10 + config.minDeviationEdge) {
                passed.push({
                    id: 'under8-ceiling',
                    label: 'Under 8 ceiling',
                    passed: true,
                    detail: `Digits 8–9 max ${maxHigh.toFixed(1)}% (≤ ${10 + config.minDeviationEdge}%)`,
                    value: `${maxHigh.toFixed(1)}%`,
                });
            } else {
                failed.push({
                    id: 'under8-ceiling',
                    label: 'Under 8 ceiling',
                    passed: false,
                    detail: `Digits 8–9 max ${maxHigh.toFixed(1)}% > ${10 + config.minDeviationEdge}%`,
                    value: `${maxHigh.toFixed(1)}%`,
                });
            }

            const patternHit = config.patternUnder8.some(p => patternConfirmed(analysisToDigits(analysis), p));
            if (patternHit) {
                passed.push({
                    id: 'pattern',
                    label: 'Pattern confirmation',
                    passed: true,
                    detail: `Pattern detected at latest ticks`,
                    value: 'confirmed',
                });
            }

            for (const p of config.patternUnder8) {
                const wr = analysis.observationalWinRates[`${p}→Under8`];
                if (wr !== null && wr !== undefined) {
                    if (wr >= 50) {
                        passed.push({
                            id: `obs-${p}`,
                            label: `Historical ${p}→Under8`,
                            passed: true,
                            detail: `${wr.toFixed(1)}% win-rate over observations`,
                            value: `${wr.toFixed(1)}%`,
                        });
                    } else {
                        failed.push({
                            id: `obs-${p}`,
                            label: `Historical ${p}→Under8`,
                            passed: false,
                            detail: `${wr.toFixed(1)}% win-rate (below 50%)`,
                            value: `${wr.toFixed(1)}%`,
                        });
                    }
                }
            }

            proposedBarrier = '8';
            reason = `Under 8: ceiling at ${maxHigh.toFixed(1)}%, ${patternHit ? 'pattern confirmed' : 'no pattern yet'}`;
            break;
        }

        case 'even': {
            const gap = Math.abs(analysis.evenPercentage - 50);
            if (analysis.evenPercentage >= 50 + config.minDeviationEdge) {
                passed.push({
                    id: 'even-edge',
                    label: 'Even edge',
                    passed: true,
                    detail: `Even at ${analysis.evenPercentage.toFixed(1)}% (+${gap.toFixed(1)} pts)`,
                    value: `${analysis.evenPercentage.toFixed(1)}%`,
                });
            } else {
                failed.push({
                    id: 'even-edge',
                    label: 'Even edge',
                    passed: false,
                    detail: `Even at ${analysis.evenPercentage.toFixed(1)}% (no edge over 50%)`,
                    value: `${analysis.evenPercentage.toFixed(1)}%`,
                });
            }
            reason = `Even: ${analysis.evenPercentage.toFixed(1)}%`;
            break;
        }

        case 'odd': {
            const gap = Math.abs(analysis.oddPercentage - 50);
            if (analysis.oddPercentage >= 50 + config.minDeviationEdge) {
                passed.push({
                    id: 'odd-edge',
                    label: 'Odd edge',
                    passed: true,
                    detail: `Odd at ${analysis.oddPercentage.toFixed(1)}% (+${gap.toFixed(1)} pts)`,
                    value: `${analysis.oddPercentage.toFixed(1)}%`,
                });
            } else {
                failed.push({
                    id: 'odd-edge',
                    label: 'Odd edge',
                    passed: false,
                    detail: `Odd at ${analysis.oddPercentage.toFixed(1)}% (no edge over 50%)`,
                    value: `${analysis.oddPercentage.toFixed(1)}%`,
                });
            }
            reason = `Odd: ${analysis.oddPercentage.toFixed(1)}%`;
            break;
        }

        case 'matches': {
            // For matches, suggest the most frequent digit (highest observed frequency).
            const sorted = [...digits].sort((a, b) => b.percentage - a.percentage);
            const hottest = sorted[0];
            proposedDigit = strategy.digit ?? hottest?.digit ?? null;
            proposedBarrier = proposedDigit !== null ? String(proposedDigit) : null;

            if (proposedDigit !== null && hottest && hottest.percentage > 10 + config.minDeviationEdge) {
                passed.push({
                    id: 'matches-hot',
                    label: 'Matches candidate',
                    passed: true,
                    detail: `Digit ${proposedDigit} at ${hottest.percentage.toFixed(1)}% (> ${10 + config.minDeviationEdge}%)`,
                    value: `${proposedDigit}: ${hottest.percentage.toFixed(1)}%`,
                });
            } else {
                failed.push({
                    id: 'matches-hot',
                    label: 'Matches candidate',
                    passed: false,
                    detail: `No digit exceeds ${10 + config.minDeviationEdge}% deviation`,
                    value: proposedDigit !== null ? `${proposedDigit}` : '—',
                });
            }
            reason = `Matches: digit ${proposedDigit} at ${hottest?.percentage.toFixed(1) ?? '—'}%`;
            break;
        }

        case 'differs': {
            // For differs, suggest the least frequent digit (lowest observed frequency).
            const sorted = [...digits].sort((a, b) => a.percentage - b.percentage);
            const coldest = sorted[0];
            proposedDigit = strategy.digit ?? coldest?.digit ?? null;
            proposedBarrier = proposedDigit !== null ? String(proposedDigit) : null;

            if (proposedDigit !== null && coldest && coldest.percentage < 10 - config.minDeviationEdge) {
                passed.push({
                    id: 'differs-cold',
                    label: 'Differs candidate',
                    passed: true,
                    detail: `Digit ${proposedDigit} at ${coldest.percentage.toFixed(1)}% (< ${10 - config.minDeviationEdge}%)`,
                    value: `${proposedDigit}: ${coldest.percentage.toFixed(1)}%`,
                });
            } else {
                failed.push({
                    id: 'differs-cold',
                    label: 'Differs candidate',
                    passed: false,
                    detail: `No digit below ${10 - config.minDeviationEdge}%`,
                    value: proposedDigit !== null ? `${proposedDigit}` : '—',
                });
            }
            reason = `Differs: digit ${proposedDigit} at ${coldest?.percentage.toFixed(1) ?? '—'}%`;
            break;
        }

        case 'custom':
            reason = 'Custom block-builder strategies are evaluated in the Bot Builder.';
            failed.push({
                id: 'custom',
                label: 'Custom strategy',
                passed: false,
                detail: 'Custom strategies run in the block builder, not the scanner.',
                value: '—',
            });
            break;
    }

    return { passed, failed, proposedDigit, proposedBarrier, reason };
}

/** Reconstruct a digit sequence from the analysis frequencies (for pattern check). */
function analysisToDigits(analysis: MarketAnalysis): number[] {
    // We can't reconstruct the exact sequence from frequencies, so use the
    // transitions to build a representative tail. For pattern confirmation we
    // only need the last two digits — use the current streak.
    if (analysis.currentStreak) {
        const d = analysis.currentStreak.digit;
        const len = analysis.currentStreak.length;
        return Array(Math.min(len, 2)).fill(d);
    }
    return [];
}

// ── Scoring ──────────────────────────────────────────────────────────────────

/**
 * Score a market ranking. The score is transparent and configurable:
 * - Data quality (sample size, feed freshness): 30%
 * - Strategy condition pass-rate: 40%
 * - Frequency stability (lower deviation = higher score): 15%
 * - Observational evidence: 15%
 */
export function scoreRanking(ranking: Omit<MarketRanking, 'score'>): number {
    const total = ranking.conditionsPassed.length + ranking.conditionsFailed.length;
    const passRate = total > 0 ? ranking.conditionsPassed.length / total : 0;

    const dataQualityScore = ranking.analysis.feedFresh ? 100 : 30;
    const sampleScore = Math.min(100, (ranking.analysis.sampleSize / 200) * 100);
    const dataScore = (dataQualityScore + sampleScore) / 2;

    const stabilityScore = Math.max(0, 100 - ranking.analysis.meanAbsoluteDeviation * 10);

    const obsValues = Object.values(ranking.analysis.observationalWinRates).filter(
        (v): v is number => v !== null && v !== undefined
    );
    const obsScore = obsValues.length > 0 ? obsValues.reduce((s, v) => s + v, 0) / obsValues.length : 50;

    return Math.round(dataScore * 0.3 + passRate * 100 * 0.4 + stabilityScore * 0.15 + obsScore * 0.15);
}

// ── Main scan ────────────────────────────────────────────────────────────────

/**
 * Scan every open volatility market, analyze each, evaluate enabled strategies,
 * and return a ranked list. Markets that don't qualify are still returned with
 * qualifies=false so the UI can show "No qualifying setup".
 */
export async function scanMarkets(
    config: ScannerConfig,
    strategies: StrategyConfig[]
): Promise<MarketRanking[]> {
    const client = new DerivPublicWebSocketClient();
    const results: MarketRanking[] = [];

    try {
        await openClient(client);
        const symbolsMessage = await request(client, { active_symbols: 'full' });
        const markets = filterDigitMarkets(
            normalizeActiveSymbols((symbolsMessage as Record<string, any>).active_symbols)
        ).filter(m => m.isOpen && !m.isSuspended);

        const enabledStrategies = strategies.filter(s => s.enabled && s.id !== 'custom');

        for (const market of markets) {
            try {
                const history = await request(client, {
                    ticks_history: market.apiSymbol,
                    end: 'latest',
                    count: SCAN_TICKS,
                    style: 'ticks',
                    subscribe: 1,
                });
                const subscriptionId = (history as Record<string, any>).subscription?.id;
                if (subscriptionId) client.send({ forget: subscriptionId });

                const digits = digitsFromHistory(history, market.pipSize);
                if (digits.length < MIN_TICKS) continue;

                const analysis = analyzeMarket(market.apiSymbol, market.displayName, digits, config, Date.now());

                // Evaluate each enabled strategy; pick the best one.
                let bestRanking: MarketRanking | null = null;

                for (const strategy of enabledStrategies) {
                    const { passed, failed, proposedDigit, proposedBarrier, reason } = evaluateStrategyConditions(
                        analysis,
                        strategy,
                        config
                    );

                    // A strategy qualifies only if no mandatory condition failed.
                    const mandatoryFailed = failed.some(f => f.id === 'sample-size' || f.id === 'feed-fresh');
                    const qualifies = !mandatoryFailed && failed.length === 0;

                    if (qualifies || !bestRanking) {
                        const candidate: MarketRanking = {
                            symbol: market.apiSymbol,
                            displayName: market.displayName,
                            category: market.category,
                            score: 0,
                            analysis,
                            conditionsPassed: passed,
                            conditionsFailed: failed,
                            strategyId: strategy.id,
                            strategyLabel: strategy.label,
                            proposedDigit,
                            proposedBarrier,
                            reason,
                            qualifies,
                        };
                        candidate.score = scoreRanking(candidate);

                        if (!bestRanking || (qualifies && !bestRanking.qualifies) || candidate.score > bestRanking.score) {
                            bestRanking = candidate;
                        }
                    }
                }

                if (bestRanking) {
                    results.push(bestRanking);
                } else {
                    // No strategy evaluated — still report the market with no setup.
                    results.push({
                        symbol: market.apiSymbol,
                        displayName: market.displayName,
                        category: market.category,
                        score: 0,
                        analysis,
                        conditionsPassed: [],
                        conditionsFailed: [
                            {
                                id: 'no-strategy',
                                label: 'No strategy',
                                passed: false,
                                detail: 'No enabled strategy evaluated this market',
                                value: '—',
                            },
                        ],
                        strategyId: null,
                        strategyLabel: null,
                        proposedDigit: null,
                        proposedBarrier: null,
                        reason: 'No qualifying setup',
                        qualifies: false,
                    });
                }
            } catch {
                /* one failing market must not stop the whole scan */
            }
        }
    } finally {
        client.disconnect();
    }

    return results.sort((a, b) => b.score - a.score);
}
