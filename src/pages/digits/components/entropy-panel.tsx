import { formatDecimal, formatPercent } from '../format';
import { STRUCTURAL_CLUSTER_THRESHOLD } from '../engines';
import type { EntropyReading } from '../engines';

interface EntropyPanelProps {
    entropy: EntropyReading;
}

/**
 * Engine B — the Shannon entropy gauge. The bar spans 0 → maxEntropy (3.3219);
 * the notch marks the 2.95 structural-cluster floor and the marker shows where
 * the live reading sits.
 */
export default function EntropyPanel({ entropy }: EntropyPanelProps) {
    const { entropyState, sampleSize } = entropy;
    const markerPercent = Math.max(0, Math.min(100, entropy.purityRatio * 100));
    const thresholdPercent = (STRUCTURAL_CLUSTER_THRESHOLD / entropy.maxEntropy) * 100;
    const isWaiting = sampleSize === 0;

    return (
        <section className='digits-panel digits-entropy'>
            <header className='digits-panel__head'>
                <h3 className='digits-panel__title'>Shannon entropy tracker</h3>
                <span className='digits-panel__note'>Unpredictability index · {entropy.windowSize}-tick window</span>
            </header>

            <div className='digits-entropy__readout'>
                <span className='digits-entropy__value'>{formatDecimal(entropy.entropy, 3)}</span>
                <span className='digits-entropy__unit'>bits / {formatDecimal(entropy.maxEntropy, 4)} max</span>
                <span className={`digits-entropy__badge digits-entropy__badge--${entropyState.toLowerCase()}`}>
                    {isWaiting ? 'MEASURING' : entropyState.replace('_', ' ')}
                </span>
            </div>

            <div className='digits-entropy__gauge' role='img' aria-label={`Entropy ${formatDecimal(entropy.entropy, 3)} of ${formatDecimal(entropy.maxEntropy, 4)} bits`}>
                <span className='digits-entropy__fill' style={{ width: `${markerPercent}%` }} />
                <span className='digits-entropy__threshold' style={{ left: `${thresholdPercent}%` }} />
            </div>

            <p className='digits-entropy__summary'>
                {isWaiting
                    ? 'Waiting for ticks to measure the distribution.'
                    : entropyState === 'PURE_NOISE'
                      ? `Distribution holds ${formatPercent(entropy.purityRatio * 100, 0)} of maximum unpredictability — no exploitable compression right now.`
                      : `Distribution compressed to ${formatPercent(entropy.purityRatio * 100, 0)} of maximum — below the ${STRUCTURAL_CLUSTER_THRESHOLD} bit floor. Active clustering.`}
            </p>
        </section>
    );
}
