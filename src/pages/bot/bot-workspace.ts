/**
 * Hand-off from the Bot tab's menus to the Bot Builder canvas.
 *
 * The selected blocks are turned into the same workspace XML the palette uses, so the canvas shows
 * them with the options the user set; `applySelectionToWorkspace` then puts them on the Bot Builder
 * workspace, replacing whatever it held.
 */
import { getBlockTemplate } from './bot-block-catalog';
import { TBotSelection } from './bot-selection-store';

const blockly = (): any => (window as any).Blockly;

const applyField = (element: Element, name: string, value: string): void => {
    if (!value) return;
    const field = Array.from(element.children).find(
        child => child.tagName.toLowerCase() === 'field' && child.getAttribute('name') === name
    );
    if (field) {
        field.textContent = value;
        return;
    }
    const created = element.ownerDocument.createElementNS(element.namespaceURI, 'field');
    created.setAttribute('name', name);
    created.textContent = value;
    element.appendChild(created);
};

/** The workspace XML of the configured blocks, or '' when nothing usable was selected. */
export const buildWorkspaceXml = (selection: TBotSelection): string => {
    const blocks = selection
        .filter(entry => entry?.type)
        .map(entry => {
            const element = getBlockTemplate(entry.type);
            if (!element) return null;
            // A block placed from here stands on its own: the palette's locked-down flags belong to
            // the palette copy, not to a block the user may need to move or delete.
            element.removeAttribute('deletable');
            element.removeAttribute('movable');
            Object.entries(entry.values ?? {}).forEach(([name, value]) => applyField(element, name, value));
            return new XMLSerializer().serializeToString(element);
        })
        .filter(Boolean);

    if (!blocks.length) return '';
    return `<xml xmlns="http://www.w3.org/1999/xhtml">${blocks.join('')}</xml>`;
};

/** Put the selected blocks on the Bot Builder canvas. Resolves true once they are in place. */
export const applySelectionToWorkspace = (xml: string): Promise<boolean> => {
    const window_blockly = blockly();
    const workspace = window_blockly?.derivWorkspace;
    if (!workspace || !xml) return Promise.resolve(false);

    return Promise.resolve(workspace.asyncClear())
        .then(() => {
            window_blockly.Xml.domToWorkspace(window_blockly.utils.xml.textToDom(xml), workspace);
            workspace.cleanUp();
            return true;
        })
        .catch(() => false);
};
