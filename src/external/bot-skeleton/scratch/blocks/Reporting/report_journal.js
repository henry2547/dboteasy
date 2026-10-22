import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/** "Journal note" — writes the program's own message into the run log. */
window.Blockly.Blocks.report_journal = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Write %1 to the run log as %2', {
                message: '%1',
                level: '%2',
            }),
            args0: [
                {
                    type: 'input_value',
                    name: 'MESSAGE',
                    check: 'String',
                },
                {
                    type: 'field_dropdown',
                    name: 'LEVEL',
                    options: [
                        [localize('info'), 'info'],
                        [localize('warning'), 'warn'],
                        [localize('error'), 'error'],
                    ],
                },
            ],
            inputsInline: true,
            previousStatement: null,
            nextStatement: null,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'Adds your own line to the run log at the chosen level, so a decision the program made — a skipped entry, a guard triggered — is visible afterwards. The text is shown exactly as written.'
            ),
            category: window.Blockly.Categories.Session_Reporting,
        };
    },
    meta() {
        return {
            display_name: localize('Journal note'),
            description: localize('Writes your own message into the run log.'),
            key_words: localize('journal log note message report info warning error'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.report_journal = block => {
    const generator = window.Blockly.JavaScript.javascriptGenerator;
    const message = generator.valueToCode(block, 'MESSAGE', generator.ORDER_ATOMIC) || "''";
    const level = block.getFieldValue('LEVEL');
    return `Bot.sessionJournal(${message}, ${JSON.stringify(level)});\n`;
};
