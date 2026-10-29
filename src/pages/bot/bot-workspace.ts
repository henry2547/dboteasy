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

/**
 * Put the selected blocks on the Bot Builder canvas, replacing what it held.
 *
 * Resolves with the block types now on the canvas, or null when they could not be placed yet. The
 * canvas is built and loaded asynchronously by the app (which loads its own initial strategy at the
 * same time), so the caller reads null as "the canvas was not ready — try again shortly" rather
 * than "nothing to do". This is the app's own way of loading a workspace, so the blocks arrive
 * exactly as they do when a strategy is loaded from a file.
 */
export const applySelectionToWorkspace = async (xml: string): Promise<string[] | null> => {
    const window_blockly = blockly();
    const workspace = window_blockly?.derivWorkspace;
    if (!workspace || !xml) return null;

    const previous_group = window_blockly.Events.getGroup();
    try {
        const xml_dom = window_blockly.utils.xml.textToDom(xml);
        window_blockly.Events.setGroup(`bot_tab_load${Date.now()}`);
        // This API already clears the workspace. A separate awaited clear lets change listeners
        // run against disposed blocks before their replacements have been installed.
        window_blockly.Xml.clearWorkspaceAndLoadFromXml(xml_dom, workspace);
        workspace.cleanUp();
        window_blockly.svgResize(workspace);
        const first_block = workspace.getTopBlocks(true)[0];
        if (first_block) workspace.centerOnBlock(first_block.id);

        const types = (workspace.getAllBlocks(false) ?? []).map((block: any) => block.type);
        return types.length ? types : null;
    } catch {
        return null;
    } finally {
        window_blockly.Events.setGroup(previous_group);
    }
};

/** Whether the canvas still holds these blocks — how the hand-off checks that its blocks stayed. */
export const workspaceHolds = (types: string[]): boolean => {
    const blocks = blockly()?.derivWorkspace?.getAllBlocks(false) ?? [];
    return types.every(type => blocks.some((block: any) => block.type === type));
};
