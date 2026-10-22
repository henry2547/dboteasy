/**
 * Shared wiring for the Digits palette blocks: colour, category, JSON definition wrapper, search
 * metadata and context menu. Each block file keeps its own `window.Blockly.Blocks.<type>` line and
 * only describes its message, fields and the engine call it generates.
 */

import { modifyContextMenu } from '../../utils';

/**
 * Builds the Blockly definition object for a digit block.
 *
 * @param {object} spec
 * @param {string} spec.message      Localised message with `%1`, `%2`… placeholders.
 * @param {object[]} [spec.args]     `args0` entries matching the message placeholders.
 * @param {'Boolean'|'Number'} spec.output
 * @param {string} spec.tooltip
 * @param {string} spec.displayName  Shown in palette search.
 * @param {string} spec.description
 * @param {string} spec.keyWords
 */
export const digitBlock = ({ message, args = [], output, tooltip, displayName, description, keyWords }) => {
    const isBoolean = output === 'Boolean';

    return {
        init() {
            this.jsonInit(this.definition());
        },
        definition() {
            return {
                message0: message,
                args0: args,
                inputsInline: true,
                output,
                outputShape: isBoolean ? window.Blockly.OUTPUT_SHAPE_HEXAGONAL : window.Blockly.OUTPUT_SHAPE_ROUND,
                colour: window.Blockly.Colours.Base.colour,
                colourSecondary: window.Blockly.Colours.Base.colourSecondary,
                colourTertiary: window.Blockly.Colours.Base.colourTertiary,
                tooltip,
                category: window.Blockly.Categories.Digits,
            };
        },
        meta() {
            return {
                display_name: displayName,
                description,
                key_words: keyWords,
            };
        },
        customContextMenu(menu) {
            modifyContextMenu(menu);
        },
    };
};

/** The number plugged into a socket, or the block's own fallback when the socket is empty. */
export const sampleCode = (block, name, fallback) =>
    window.Blockly.JavaScript.javascriptGenerator.valueToCode(
        block,
        name,
        window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC
    ) || fallback;

/** Wraps the engine call a block builds into the `[code, precedence]` a generator returns. */
export const digitGenerator = buildCall => block => [
    buildCall(block, window.Blockly.JavaScript.javascriptGenerator),
    window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC,
];
