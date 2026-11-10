/**
 * The Rise/Fall surface the generated program talks to.
 *
 * Every read is synchronous and comes from the engine the Rise/Fall tab has
 * mounted, through `utils/rise-fall-runtime`. Nothing here re-implements a
 * strategy or buys a contract: `rfEnter` asks the engine's own central executor,
 * and its refusal reason is journalled verbatim.
 */

import { riseFallRuntime } from '@/utils/rise-fall-runtime';

const asNumber = value => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

const getRiseFallInterface = tradeEngine => ({
    rfConnected: () => riseFallRuntime.connected,
    rfSignal: () => riseFallRuntime.snapshot().direction,
    rfScore: side => {
        const snapshot = riseFallRuntime.snapshot();
        return asNumber(side === 'fall' ? snapshot.fallScore : snapshot.riseScore);
    },
    rfRegime: () => riseFallRuntime.snapshot().regime,
    rfBestStrategy: () => riseFallRuntime.snapshot().bestStrategy ?? '',
    rfStat: stat => asNumber(riseFallRuntime.snapshot().stats[stat] ?? 0),
    rfReport: () => riseFallRuntime.report(),
    rfEnter: (stake, durationTicks) => {
        const result = riseFallRuntime.requestEntry({
            stake: asNumber(stake),
            durationTicks: asNumber(durationTicks),
        });
        if (!result.ok && result.reason) {
            tradeEngine.journalNote(`Rise/Fall entry refused — ${result.reason}`, 'warn');
        }
        return result.ok;
    },
});

export default getRiseFallInterface;
