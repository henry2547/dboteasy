/**
 * Registers the observational digit blocks (migrated from the Bots tab) as real Bot Builder blocks.
 *
 * Definitions are generated from `./observer-catalog` so the palette stays in one place; the
 * catalogue is pure data and this file is the only place that touches `window.Blockly`.
 */
import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';
import { BLOCKS, groupFor } from './observer-catalog';

/** Precision 0 keeps the percentage/tolerance fields whole, as in the observer workspace. */
const WHOLE_NUMBER_FIELDS = ['PERCENT', 'TOLERANCE', 'VALUE', 'LOW', 'HIGH'];

/**
 * The observer language has its own socket types; the built-in Boolean/Array checks are accepted
 * as well so these blocks can be wired to the existing digit logic blocks.
 */
const CHECK = {
    Condition: ['Condition', 'Boolean'],
    Number: ['Number'],
    String: ['String'],
    Digits: ['Digits', 'Array'],
};

const fieldArg = field => {
    if (field.kind === 'number') {
        const arg = { type: 'field_number', name: field.name, value: Number(field.value) };
        if (field.min !== undefined) arg.min = field.min;
        if (field.max !== undefined) arg.max = field.max;
        arg.precision = WHOLE_NUMBER_FIELDS.includes(field.name) ? 0 : 1;
        return arg;
    }
    if (field.kind === 'select') {
        return { type: 'field_dropdown', name: field.name, options: field.choices.map(choice => [choice, choice]) };
    }
    return { type: 'field_input', name: field.name, text: String(field.value) };
};

const definition = spec => {
    const group = groupFor(spec);
    const json = {
        // Label followed by one inline "label + field" token per configured field.
        message0: [spec.label, ...spec.fields.map((field, index) => `${field.label} %${index + 1}`)].join(' '),
        args0: spec.fields.map(fieldArg),
        inputsInline: false,
    };

    let row = 1;
    Object.entries(spec.inputs).forEach(([name, port]) => {
        json[`message${row}`] = `${name.toLowerCase()} %1`;
        json[`args${row}`] = [{ type: 'input_value', name, check: CHECK[port] }];
        row += 1;
    });
    if (spec.body) {
        json[`message${row}`] = 'do %1';
        json[`args${row}`] = [{ type: 'input_statement', name: 'DO' }];
        row += 1;
    }
    if (spec.op === 'if_else') {
        json[`message${row}`] = 'else %1';
        json[`args${row}`] = [{ type: 'input_statement', name: 'ELSE' }];
        row += 1;
    }

    if (spec.output) {
        json.output = CHECK[spec.output];
        json.outputShape =
            spec.output === 'Condition' ? window.Blockly.OUTPUT_SHAPE_HEXAGONAL : window.Blockly.OUTPUT_SHAPE_ROUND;
    } else if (!spec.event) {
        // Statement blocks; event blocks stay hat-shaped roots that hold a "do" sequence.
        json.previousStatement = null;
        json.nextStatement = null;
    }

    json.colour = group.colour;
    json.colourSecondary = group.colourSecondary;
    json.colourTertiary = group.colourTertiary;
    json.tooltip = localize(spec.help);
    json.category = group.id;
    return json;
};

BLOCKS.forEach(spec => {
    const group = groupFor(spec);
    window.Blockly.Blocks[spec.type] = {
        init() {
            this.jsonInit(definition(spec));
        },
        meta() {
            return {
                display_name: localize(spec.label),
                description: localize(spec.help),
                key_words: localize(`${spec.label} ${spec.op.split('_').join(' ')} ${group.name}`),
            };
        },
        customContextMenu(menu) {
            modifyContextMenu(menu);
        },
    };
});
