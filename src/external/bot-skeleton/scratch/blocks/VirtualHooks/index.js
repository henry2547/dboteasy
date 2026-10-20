/**
 * Virtual Hook blocks.
 *
 * The blocks are configuration only: `services/virtual-hooks/` owns the runtime, reads these
 * blocks off the canvas once per run and dispatches genuine ticks to the registered hooks. This
 * file is the only place in the folder touching `window.Blockly`.
 *
 * Generated code:
 * - a registration or a listener hat emits a comment (the runtime drives them from the tick
 *   stream, so generating them would run them twice);
 * - a condition emits `Bot.vhookCondition(id)` — that is what makes the block usable inside
 *   Purchase conditions as a real gate on automated trade execution;
 * - a result emits `Bot.vhookResult(id, field)`;
 * - a trigger emits `Bot.vhookTrigger(name, data)`.
 *
 * Without a generator the interpreter reports
 * `JavaScript generator does not know how to generate code for block type "vhook_…"`.
 */
import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

const COLOURS = {
    colour: '#6d28d9',
    colourSecondary: '#7c3aed',
    colourTertiary: '#c4b5fd',
};

const EVENT_OPTIONS = [
    ['New tick', 'tick'],
    ['Digit pattern detected', 'digit_pattern'],
    ['Analysis condition met', 'analysis_condition'],
    ['Contract purchased', 'contract_purchased'],
    ['Contract settled', 'contract_settled'],
    ['Manual trigger', 'manual'],
];

const CONCURRENCY_OPTIONS = [
    ['one at a time (queue)', 'sequential'],
    ['skip while busy', 'skip'],
    ['queue, keep newest', 'queue'],
];

const CONDITION_OPTIONS = [
    ['last digit equals', 'last_digit_equals'],
    ['last digit in set', 'last_digit_in_set'],
    ['consecutive digits match', 'consecutive_match'],
    ['confirmation sequence', 'confirm_sequence'],
    ['digit frequency above', 'frequency_above'],
    ['digit frequency below', 'frequency_below'],
    ['combined digit share below', 'losing_set_below'],
    ['valid ticks received at least', 'min_valid_ticks'],
    ['market and feed valid', 'feed_valid'],
];

const DIGIT_OPTIONS = [
    ['any', 'any'],
    ['0', '0'],
    ['1', '1'],
    ['2', '2'],
    ['3', '3'],
    ['4', '4'],
    ['5', '5'],
    ['6', '6'],
    ['7', '7'],
    ['8', '8'],
    ['9', '9'],
];

const RESULT_OPTIONS = [
    ['hook name', 'hook_name'],
    ['event type', 'event_type'],
    ['market symbol', 'market'],
    ['event timestamp', 'event_timestamp'],
    ['latest quote', 'quote'],
    ['last digit', 'last_digit'],
    ['matched pattern', 'matched_pattern'],
    ['trigger reason', 'trigger_reason'],
    ['digit frequency (%)', 'digit_frequency'],
    ['condition result', 'condition_result'],
    ['execution identifier', 'execution_id'],
];

window.Blockly.Blocks.vhook_register = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Register Virtual Hook {{ name }}', { name: '%1' }),
            args0: [{ type: 'field_input', name: 'NAME', text: 'entry' }],
            message1: localize('event {{ event }} · market {{ market }}', { event: '%1', market: '%2' }),
            args1: [
                { type: 'field_dropdown', name: 'EVENT', options: EVENT_OPTIONS },
                { type: 'field_input', name: 'MARKET', text: '' },
            ],
            message2: localize('enabled {{ enabled }} · priority {{ priority }}', {
                enabled: '%1',
                priority: '%2',
            }),
            args2: [
                { type: 'field_checkbox', name: 'ENABLED', checked: true },
                { type: 'field_number', name: 'PRIORITY', value: 10, min: 0, max: 99, precision: 1 },
            ],
            message3: localize('concurrency {{ policy }}', { policy: '%1' }),
            args3: [{ type: 'field_dropdown', name: 'CONCURRENCY', options: CONCURRENCY_OPTIONS }],
            message4: localize('condition {{ condition }}', { condition: '%1' }),
            args4: [{ type: 'input_value', name: 'CONDITION', check: 'Boolean' }],
            previousStatement: null,
            nextStatement: null,
            ...COLOURS,
            tooltip: localize(
                'Registers a named hook. Nothing runs when the workspace loads or the bot starts — only when the event you chose actually occurs. Leave the market empty to listen on the market the bot trades. A duplicate hook name is rejected before the run so one event cannot run twice.'
            ),
            helpUrl: '',
        };
    },
    meta() {
        return {
            display_name: localize('Register Virtual Hook'),
            description: localize(
                'Defines a named hook and the event that activates it. Hooks receive genuine ticks from the running market feed.'
            ),
            key_words: localize('virtual hook register event listener automation trigger'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.Blocks.vhook_listener = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('When Virtual Hook {{ hook }} fires', { hook: '%1' }),
            args0: [{ type: 'field_input', name: 'HOOK', text: 'entry' }],
            message1: localize('do {{ action }}', { action: '%1' }),
            args1: [{ type: 'input_statement', name: 'DO' }],
            nextStatement: null,
            ...COLOURS,
            tooltip: localize(
                'Runs the connected blocks, in order, when the named hook fires. It does not run when the workspace loads, when you press Run, or when unrelated hooks fire. Multiple listeners on one hook run in canvas order.'
            ),
            helpUrl: '',
        };
    },
    meta() {
        return {
            display_name: localize('When Virtual Hook fires'),
            description: localize('Attaches executable logic to a registered virtual hook.'),
            key_words: localize('virtual hook listener when fires execute'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.Blocks.vhook_trigger = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Trigger Virtual Hook {{ hook }}', { hook: '%1' }),
            args0: [{ type: 'field_input', name: 'NAME', text: 'entry' }],
            message1: localize('with data {{ data }}', { data: '%1' }),
            args1: [{ type: 'input_value', name: 'DATA', check: 'String' }],
            previousStatement: null,
            nextStatement: null,
            ...COLOURS,
            tooltip: localize(
                'Deliberately fires a registered hook. An unknown or disabled hook is reported instead of firing, and a hook can never trigger itself or recurse past four levels.'
            ),
            helpUrl: '',
        };
    },
    meta() {
        return {
            display_name: localize('Trigger Virtual Hook'),
            description: localize('Fires a registered hook from a connected block sequence.'),
            key_words: localize('virtual hook trigger fire manual'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.Blocks.vhook_condition = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Virtual Hook Condition {{ condition }}', { condition: '%1' }),
            args0: [{ type: 'field_dropdown', name: 'CONDITION', options: CONDITION_OPTIONS }],
            message1: localize('digit {{ digit }} · count {{ count }} · threshold % {{ threshold }}', {
                digit: '%1',
                count: '%2',
                threshold: '%3',
            }),
            args1: [
                { type: 'field_dropdown', name: 'DIGIT', options: DIGIT_OPTIONS },
                { type: 'field_number', name: 'COUNT', value: 2, min: 2, max: 20, precision: 1 },
                { type: 'field_number', name: 'THRESHOLD', value: 10, min: 0, max: 100, precision: 1 },
            ],
            message2: localize('set {{ set }} · sequence {{ sequence }}', { set: '%1', sequence: '%2' }),
            args2: [
                { type: 'field_input', name: 'SET', text: '0,1' },
                { type: 'field_input', name: 'SEQUENCE', text: '1,1,5' },
            ],
            message3: localize('sample {{ sample }} ticks', { sample: '%1' }),
            args3: [{ type: 'field_number', name: 'SAMPLE', value: 100, min: 1, max: 1000, precision: 0 }],
            inputsInline: false,
            output: 'Boolean',
            outputShape: window.Blockly.OUTPUT_SHAPE_HEXAGONAL,
            ...COLOURS,
            tooltip: localize(
                'Evaluates a condition against the genuine ticks the running feed delivered. Place it inside Purchase conditions to gate automated trade execution, or on a Register Virtual Hook block to filter that hook’s events. Missing data never passes.'
            ),
            helpUrl: '',
        };
    },
    meta() {
        return {
            display_name: localize('Virtual Hook Condition'),
            description: localize(
                'Checks the last digit, a digit set, a consecutive run, a confirmation sequence, digit frequency, the valid tick count or feed health.'
            ),
            key_words: localize('virtual hook condition pattern digit frequency gate purchase'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.Blocks.vhook_result = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Virtual Hook Result {{ field }}', { field: '%1' }),
            args0: [{ type: 'field_dropdown', name: 'FIELD', options: RESULT_OPTIONS }],
            output: 'String',
            outputShape: window.Blockly.OUTPUT_SHAPE_ROUND,
            ...COLOURS,
            tooltip: localize(
                'A validated value from the hook event that is being handled (numbers arrive as text). Empty when the hook runtime has no event yet.'
            ),
            helpUrl: '',
        };
    },
    meta() {
        return {
            display_name: localize('Virtual Hook Result'),
            description: localize('Reads hook name, event, market, quote, digit, pattern, reason or execution id.'),
            key_words: localize('virtual hook result output event data'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

const generator = window.Blockly.JavaScript.javascriptGenerator;
const literal = value => JSON.stringify(String(value));

const canvasDriven = block => {
    if (block.type === 'vhook_register' || block.type === 'vhook_listener') return true;
    // A trigger or condition that is part of a listener chain is executed by the hook runtime,
    // never by the generated program.
    const root = block.getRootBlock?.() ?? block;
    return root.type === 'vhook_listener';
};

generator.forBlock.vhook_register = block =>
    `/* Register Virtual Hook ${literal(block.getFieldValue?.('NAME') ?? '')} — registered by the virtual hook runtime */\n`;

generator.forBlock.vhook_listener = block =>
    `/* When Virtual Hook ${literal(block.getFieldValue?.('HOOK') ?? '')} fires — executed by the virtual hook runtime */\n`;

generator.forBlock.vhook_trigger = block => {
    if (canvasDriven(block)) return `/* Trigger Virtual Hook — executed by the virtual hook runtime */\n`;
    const name = literal(block.getFieldValue('NAME'));
    const data = generator.valueToCode(block, 'DATA', generator.ORDER_ATOMIC) || "''";
    return `Bot.vhookTrigger(${name}, ${data});\n`;
};

generator.forBlock.vhook_condition = block => {
    if (canvasDriven(block)) return ['false', generator.ORDER_ATOMIC];
    return [`Bot.vhookCondition(${literal(block.id)})`, generator.ORDER_ATOMIC];
};

generator.forBlock.vhook_result = block => {
    if (canvasDriven(block)) return ["''", generator.ORDER_ATOMIC];
    return [`Bot.vhookResult(${literal(block.id)}, ${literal(block.getFieldValue('FIELD'))})`, generator.ORDER_ATOMIC];
};
