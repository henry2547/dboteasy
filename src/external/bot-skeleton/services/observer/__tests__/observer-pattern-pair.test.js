/**
 * The pair rule of "Detect Consecutive Digit Pair", exercised on a plain program graph.
 *
 * A pair pattern is only valid when the two newest digits are the *same* digit and that pair is
 * part of the set the block was configured with — 00, 11, 88 or 99. So:
 * - two different digits never arm it, whatever the set covers;
 * - two equal digits outside the picked set never arm it;
 * - the pair must be the newest two ticks, not an earlier equal pair in the window;
 * - confirmation is a separate step — arming does not confirm on its own tick.
 */
import { ObserverEngine, STAGES } from '../observer-engine';
import { BLOCKS } from '../../../scratch/blocks/Observer/observer-catalog';

const block = (id, op, extra = {}) => ({
    id,
    op,
    label: extra.label ?? op,
    event: extra.event ?? null,
    fields: extra.fields ?? {},
    inputs: extra.inputs ?? {},
    body: extra.body ?? null,
    else_body: extra.else_body ?? null,
    next: extra.next ?? null,
});

/** When New Tick Arrives -> Detect Consecutive Digit Pair -> Wait For Confirmation Digit. */
const pairProgram = ({ pairs = '00 / 11', confirm_digit = 1 } = {}) => {
    const blocks = [
        block('hat', 'event', { event: 'tick', body: 'pair1', label: 'When New Tick Arrives' }),
        block('pair1', 'pattern_detect_pair', {
            fields: { PAIRS: pairs },
            next: 'conf1',
            label: 'Detect Consecutive Digit Pair',
        }),
        block('conf1', 'pattern_confirm_digit', { fields: { DIGIT: confirm_digit }, label: 'Wait For Confirmation Digit' }),
        block('setup_hat', 'event', { event: 'setup', body: 'note1', label: 'When Setup Is Detected' }),
        block('note1', 'note', { fields: { TEXT: 'Pair confirmed' } }),
    ];
    return {
        blocks: new Map(blocks.map(item => [item.id, item])),
        events: new Map([
            ['tick', ['hat']],
            ['setup', ['setup_hat']],
        ]),
        entries: [],
        roots: [],
        has_entry_gate: false,
    };
};

let epoch = 1000;
const feed = (engine, prices) => {
    // Epochs move forward across calls too: the runtime treats one epoch as one genuine tick.
    prices.forEach(price => {
        epoch += 1;
        engine.feedTick({ symbol: 'R_100', price, epoch, pip_size: 2 });
    });
};

const journalFor = () => {
    const lines = [];
    return { lines, write: message => lines.push(message) };
};

const written = journal => journal.lines.join('\n');

describe('pair pattern detection', () => {
    it('arms only when the two newest digits are the same digit inside the picked pair set', () => {
        const journal = journalFor();
        const engine = new ObserverEngine(pairProgram({ pairs: '00 / 11', confirm_digit: 0 }), { journal: journal.write });
        engine.start({ symbol: 'R_100' });

        // 1 then 0: two different digits, so no pattern however the palette is set.
        feed(engine, [1.01, 1.00]);
        expect(engine.ctx.stage).toBe(STAGES.WAITING_PAIR);

        // Still only single digits passing — 5 then 2 differs as well.
        feed(engine, [1.05, 1.02]);
        expect(engine.ctx.stage).toBe(STAGES.WAITING_PAIR);
        expect(written(journal)).not.toContain('Pattern detected');

        // The newest two ticks are now 0 and 0, and 00 is in the picked set.
        feed(engine, [1.00, 1.00]);
        expect(engine.ctx.stage).toBe(STAGES.WAITING_CONFIRMATION);
        expect(engine.ctx.pattern).toMatchObject({ kind: 'pair', digit: 0, waiting: true, confirmed: false });
        expect(written(journal)).toContain('Pattern detected: pair 00');

        // The equal pair has to be the newest two ticks: a 0 followed by a 5 arms nothing new.
        const armed_at = engine.ctx.pattern.started_tick;
        feed(engine, [1.05]);
        expect(engine.ctx.pattern.started_tick).toBe(armed_at);
        expect(written(journal).match(/Pattern detected: pair/g)).toHaveLength(1);
    });

    it('never arms on two equal digits outside the picked pair set', () => {
        const journal = journalFor();
        const engine = new ObserverEngine(pairProgram({ pairs: '00 / 11', confirm_digit: 0 }), { journal: journal.write });
        engine.start({ symbol: 'R_100' });

        // 22 is not part of "00 / 11", even though the two digits are equal.
        feed(engine, [1.22, 1.22]);
        expect(engine.ctx.stage).toBe(STAGES.WAITING_PAIR);
        expect(written(journal)).not.toContain('Pattern detected');

        // The same pair arms the block once it is the picked set.
        const other = new ObserverEngine(pairProgram({ pairs: '88 / 99', confirm_digit: 0 }), { journal: () => {} });
        other.start({ symbol: 'R_100' });
        feed(other, [1.22, 1.22]);
        expect(other.ctx.stage).toBe(STAGES.WAITING_PAIR);
        feed(other, [1.88, 1.88]);
        expect(other.ctx.stage).toBe(STAGES.WAITING_CONFIRMATION);
        expect(other.ctx.pattern).toMatchObject({ kind: 'pair', digit: 8 });
    });

    it('keeps confirmation separate: arming waits, the confirmation digit confirms', () => {
        const journal = journalFor();
        const engine = new ObserverEngine(pairProgram({ pairs: '00 / 11', confirm_digit: 1 }), { journal: journal.write });
        engine.start({ symbol: 'R_100' });

        // 4, 0, 0 — the pair arms on the third tick and confirms nothing on that same tick.
        feed(engine, [1.04, 1.00, 1.00]);
        expect(engine.ctx.stage).toBe(STAGES.WAITING_CONFIRMATION);
        expect(engine.ctx.pattern.confirmed).toBe(false);
        expect(written(journal)).toContain('Pattern detected: pair 00');
        expect(written(journal)).not.toContain('Confirmation digit');

        // A digit that is not the one asked for waits instead of confirming.
        feed(engine, [1.05]);
        expect(engine.ctx.pattern.confirmed).toBe(false);
        expect(engine.ctx.stage).toBe(STAGES.WAITING_CONFIRMATION);

        // The configured confirmation digit ends it, on its own tick.
        feed(engine, [1.01]);
        expect(engine.ctx.pattern.confirmed).toBe(true);
        expect(engine.ctx.stage).toBe(STAGES.SETUP);
        expect(written(journal)).toContain('Confirmation digit 1 arrived after pair 00.');
        expect(written(journal)).toContain('Pair confirmed');
    });

    it('offers the pair set the rule is written for', () => {
        const spec = BLOCKS.find(item => item.type === 'obs_pair');
        const choices = spec.fields.find(field => field.name === 'PAIRS').choices;
        const pairs = choices.flatMap(choice => choice.split('/').map(part => part.trim()));
        expect(pairs).toEqual(expect.arrayContaining(['00', '11', '88', '99']));
        expect(spec.help).toContain('the two newest digits are equal');
    });
});
