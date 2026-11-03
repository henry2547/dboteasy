import { localize } from '@deriv-com/translations';
import { emptyTextValidator, modifyContextMenu } from '../../../../utils';

window.Blockly.Blocks.sweet_alert = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Sweet alert {{ alert_icon }} title: {{ alert_title }} message: {{ alert_message }}', {
                alert_icon: '%1',
                alert_title: '%2',
                alert_message: '%3',
            }),
            args0: [
                {
                    type: 'field_dropdown',
                    name: 'ALERT_ICON',
                    options: [
                        [localize('Success'), 'success'],
                        [localize('Error'), 'error'],
                        [localize('Warning'), 'warning'],
                        [localize('Info'), 'info'],
                        [localize('Question'), 'question'],
                    ],
                },
                {
                    type: 'input_value',
                    name: 'TITLE',
                    check: null,
                },
                {
                    type: 'input_value',
                    name: 'MESSAGE',
                    check: null,
                },
            ],
            colour: window.Blockly.Colours.Special3.colour,
            colourSecondary: window.Blockly.Colours.Special3.colourSecondary,
            colourTertiary: window.Blockly.Colours.Special3.colourTertiary,
            previousStatement: null,
            nextStatement: null,
            tooltip: localize(
                'Shows a SweetAlert popup with an icon, a title and a message — use it to announce a take profit or a stop loss.'
            ),
            category: window.Blockly.Categories.Miscellaneous,
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
    meta() {
        return {
            display_name: localize('Sweet alert'),
            description: localize(
                'This block shows a SweetAlert popup. Pick an icon, then give it a title and a message — for example the take profit or the stop loss a trade reached.'
            ),
        };
    },
    getRequiredValueInputs() {
        return {
            TITLE: emptyTextValidator,
            MESSAGE: emptyTextValidator,
        };
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.sweet_alert = block => {
    const icon = block.getFieldValue('ALERT_ICON') || 'info';
    const generator = window.Blockly.JavaScript.javascriptGenerator;
    const title = generator.valueToCode(block, 'TITLE', generator.ORDER_ATOMIC) || `"${localize('Alert')}"`;
    const message = generator.valueToCode(block, 'MESSAGE', generator.ORDER_ATOMIC) || `""`;

    const code = `Bot.sweetAlert({ icon: '${icon}', title: ${title}, message: ${message} });\n`;
    return code;
};
