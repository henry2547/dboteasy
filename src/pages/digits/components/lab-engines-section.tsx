import type { useLabEngines } from '../use-lab-engines';
import EntropyPanel from './entropy-panel';
import LatencyGuardPanel from './latency-guard-panel';
import ScattergramPanel from './scattergram-panel';
import VelocityMatrixPanel from './velocity-matrix-panel';
import WalkForwardPanel from './walk-forward-panel';

interface LabEnginesSectionProps {
    engines: ReturnType<typeof useLabEngines>;
}

/** Groups the five advanced analytics engines under one heading on the Digits tab. */
export default function LabEnginesSection({ engines }: LabEnginesSectionProps) {
    return (
        <section className='digits-engines'>
            <header className='digits-engines__head'>
                <h3 className='digits-engines__title'>Advanced analytics engines</h3>
                <p className='digits-engines__subtitle'>
                    Five quantitative layers over the same live 1,000-tick buffer — velocity, entropy, latency safety,
                    pacing and a zero-lookahead walk-forward.
                </p>
            </header>

            <VelocityMatrixPanel matrix={engines.velocityMatrix} />
            <EntropyPanel entropy={engines.entropy} />
            <LatencyGuardPanel guard={engines.latencyGuard} />
            <ScattergramPanel scattergram={engines.scattergram} />
            <WalkForwardPanel report={engines.walkForward} />
        </section>
    );
}
