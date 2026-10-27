// @ts-nocheck — vendored bot code with known upstream type gaps; see AGENTS.md
import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { LabelPairedChevronDownMdFillIcon } from '@deriv/quill-icons/LabelPaired';
import { localize } from '@deriv-com/translations';
import { useDevice } from '@deriv-com/ui';
/* [AI] - Analytics event tracking removed - see migrate-docs/MONITORING_PACKAGES.md for re-implementation guide */
import ToolbarButton from '../toolbar/toolbar-button';
import BlocksPalette from './blocks-palette';
import MobileToolsMenu from './mobile-tools-menu';
import { ToolboxItems } from './toolbox-items';

/**
 * The blocks palette. On a desktop it is the docked panel it always was — the header collapses it.
 * Below the desktop breakpoint there is no room to dock a panel next to the canvas, so the palette
 * and the Quick strategy entry point move into one collapsible menu over the canvas
 * (`mobile-tools-menu.tsx`).
 */
const Toolbox = observer(() => {
    const { isDesktop } = useDevice();
    const { toolbox, flyout, quick_strategy } = useStore();
    const { onMount, onUnmount } = toolbox;

    const { setFormVisibility } = quick_strategy;
    const { setVisibility } = flyout;

    const toolbox_ref = React.useRef(ToolboxItems());
    const [is_open, setOpen] = React.useState(true);

    React.useEffect(() => {
        onMount(toolbox_ref);
        return () => onUnmount();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Blockly measures the box it is rendered into, and that box changes when the palette collapses.
    // Re-measure once the transition has settled, not only while it runs.
    React.useEffect(() => {
        const workspace = window.Blockly?.derivWorkspace;
        if (!workspace) return undefined;
        window.Blockly.svgResize(workspace);
        const timer = setTimeout(() => window.Blockly.svgResize(workspace), 320);
        return () => clearTimeout(timer);
    }, [is_open]);

    const handleQuickStrategyOpen = () => {
        setFormVisibility(true);
        /* [AI] - Analytics event tracking removed - see migrate-docs/MONITORING_PACKAGES.md for re-implementation guide */
        /* [/AI] */
    };

    if (!isDesktop) return <MobileToolsMenu />;

    return (
        <div className='db-toolbox' data-testid='dashboard__toolbox'>
            <ToolbarButton
                popover_message={localize('Click here to start building your Deriv Bot.')}
                button_id='db-toolbar__get-started-button'
                button_classname='toolbar__btn toolbar__btn--icon toolbar__btn--start'
                buttonOnClick={handleQuickStrategyOpen}
                button_text={localize('Quick strategy')}
            />
            <div id='gtm-toolbox' className='db-toolbox__content'>
                <div className='db-toolbox__header'>
                    <div
                        className='db-toolbox__title'
                        data-testid='db-toolbox__title'
                        onClick={() => {
                            setOpen(!is_open);
                            setVisibility(false);
                        }}
                    >
                        {localize('Blocks menu')}
                        <span
                            className={classNames('db-toolbox__title__chevron', {
                                'db-toolbox__title__chevron--active': is_open,
                            })}
                        >
                            <LabelPairedChevronDownMdFillIcon fill='var(--text-general)' />
                        </span>
                    </div>
                </div>
                <div
                    className={classNames('db-toolbox__content-wrapper', { active: is_open })}
                    data-testid='db-toolbox__content-wrapper'
                >
                    <BlocksPalette />
                </div>
            </div>
        </div>
    );
});

export default Toolbox;
