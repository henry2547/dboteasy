// @ts-nocheck — vendored bot code with known upstream type gaps; see AGENTS.md
import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import Text from '@/components/shared_ui/text';
import { useStore } from '@/hooks/useStore';
import { LabelPairedChevronDownMdFillIcon, LabelPairedXmarkMdFillIcon } from '@deriv/quill-icons/LabelPaired';
import { localize } from '@deriv-com/translations';
import { useDevice } from '@deriv-com/ui';
/* [AI] - Analytics event tracking removed - see migrate-docs/MONITORING_PACKAGES.md for re-implementation guide */
/* [/AI] */
import ToolbarButton from '../toolbar/toolbar-button';
import SearchBox from './search-box';
import { ToolboxItems } from './toolbox-items';

/**
 * The blocks palette. On a desktop it is the docked panel it always was — the header collapses it.
 * Below the desktop breakpoint there is no room to dock a panel next to the canvas, so the same
 * palette is rendered as a drawer over it: closed by default, opened from the "Blocks" tab on the
 * left edge, and closed again as soon as a category puts its flyout on the screen (or on a tap
 * outside it). The canvas keeps the full width while the drawer is closed.
 */
const Toolbox = observer(() => {
    const { isDesktop } = useDevice();
    const { toolbox, flyout, quick_strategy } = useStore();
    const {
        hasSubCategory,
        is_search_loading,
        onMount,
        onSearchBlur,
        onSearchClear,
        onSearchKeyUp,
        onToolboxItemClick,
        onToolboxItemExpand,
        onUnmount,
        sub_category_index,
        toolbox_dom,
    } = toolbox;

    const { setFormVisibility } = quick_strategy;
    const { setVisibility, selected_category } = flyout;

    const toolbox_ref = React.useRef(ToolboxItems());
    const [is_open, setOpen] = React.useState(true);
    const [is_drawer_open, setDrawerOpen] = React.useState(false);
    const [pending_selection] = React.useState<string | null>(null);

    React.useEffect(() => {
        onMount(toolbox_ref);
        return () => onUnmount();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Blockly measures the box it is rendered into, and that box changes with the palette (the
    // drawer covers the canvas on a phone, collapsing frees the space on a desktop). Re-measure
    // once the transition has settled, not only while it runs.
    React.useEffect(() => {
        const workspace = window.Blockly?.derivWorkspace;
        if (!workspace) return undefined;
        window.Blockly.svgResize(workspace);
        const timer = setTimeout(() => window.Blockly.svgResize(workspace), 320);
        return () => clearTimeout(timer);
    }, [is_open, is_drawer_open]);

    const handleQuickStrategyOpen = () => {
        setFormVisibility(true);
        /* [AI] - Analytics event tracking removed - see migrate-docs/MONITORING_PACKAGES.md for re-implementation guide */
        /* [/AI] */
    };

    const closeDrawer = () => {
        setDrawerOpen(false);
        setVisibility(false);
    };

    const handleCategoryClick = (category: HTMLElement) => {
        onToolboxItemClick(category);
        // The flyout takes the screen on a phone, so the drawer gets out of its way.
        if (!isDesktop) setDrawerOpen(false);
    };

    const is_content_open = isDesktop ? is_open : true;

    return (
        <>
            {!isDesktop && !is_drawer_open && (
                <button
                    type='button'
                    className='db-toolbox__drawer-tab'
                    data-testid='db-toolbox__drawer-tab'
                    aria-expanded={false}
                    aria-controls='gtm-toolbox'
                    onClick={() => setDrawerOpen(true)}
                >
                    {localize('Blocks')}
                    <LabelPairedChevronDownMdFillIcon
                        className='db-toolbox__drawer-tab__icon'
                        fill='var(--text-general)'
                    />
                </button>
            )}
            {!isDesktop && is_drawer_open && (
                <div className='db-toolbox__scrim' data-testid='db-toolbox__scrim' onClick={closeDrawer} />
            )}
            <div
                className={classNames('db-toolbox', {
                    'db-toolbox--mobile': !isDesktop,
                    'db-toolbox--open': is_drawer_open,
                })}
                data-testid='dashboard__toolbox'
            >
                {/* The mobile toolbar already carries the Quick strategy button. */}
                {isDesktop && (
                    <ToolbarButton
                        popover_message={localize('Click here to start building your Deriv Bot.')}
                        button_id='db-toolbar__get-started-button'
                        button_classname='toolbar__btn toolbar__btn--icon toolbar__btn--start'
                        buttonOnClick={handleQuickStrategyOpen}
                        button_text={localize('Quick strategy')}
                    />
                )}
                <div id='gtm-toolbox' className='db-toolbox__content'>
                    <div className='db-toolbox__header'>
                        <div
                            className='db-toolbox__title'
                            data-testid='db-toolbox__title'
                            onClick={() => {
                                if (!isDesktop) {
                                    closeDrawer();
                                    return;
                                }
                                setOpen(!is_open);
                                setVisibility(false);
                            }}
                        >
                            {localize('Blocks menu')}
                            <span
                                className={classNames('db-toolbox__title__chevron', {
                                    'db-toolbox__title__chevron--active': isDesktop ? is_open : is_drawer_open,
                                })}
                            >
                                {isDesktop ? (
                                    <LabelPairedChevronDownMdFillIcon fill='var(--text-general)' />
                                ) : (
                                    <LabelPairedXmarkMdFillIcon fill='var(--text-general)' />
                                )}
                            </span>
                        </div>
                    </div>
                    <div
                        className={classNames('db-toolbox__content-wrapper', { active: is_content_open })}
                        data-testid='db-toolbox__content-wrapper'
                    >
                        <SearchBox
                            is_search_loading={is_search_loading}
                            onSearch={toolbox.onSearch}
                            onSearchBlur={onSearchBlur}
                            onSearchClear={onSearchClear}
                            onSearchKeyUp={onSearchKeyUp}
                        />
                        <div className='db-toolbox__category-menu'>
                            {toolbox_dom &&
                                Array.from(toolbox_dom.childNodes as HTMLElement[]).map((category, index) => {
                                    if (category.tagName.toUpperCase() === 'CATEGORY') {
                                        const has_sub_category = hasSubCategory(category.children);
                                        const is_sub_category_open = sub_category_index.includes(index);
                                        return (
                                            <div
                                                key={`db-toolbox__row--${category.getAttribute('id')}`}
                                                className={classNames('db-toolbox__row', {
                                                    'db-toolbox__row--active':
                                                        selected_category?.getAttribute('id') === category?.id,
                                                    'db-toolbox__row--pending':
                                                        pending_selection === category?.getAttribute('id'),
                                                })}
                                            >
                                                <div
                                                    className='db-toolbox__item'
                                                    onClick={() => {
                                                        if (has_sub_category) {
                                                            onToolboxItemExpand(index);
                                                            return;
                                                        }
                                                        handleCategoryClick(category);
                                                    }}
                                                >
                                                    <div className='db-toolbox__category-text'>
                                                        <div className='db-toolbox__label'>
                                                            {localize(category.getAttribute('name') as string)}
                                                        </div>
                                                        {has_sub_category && (
                                                            <div
                                                                className={classNames('db-toolbox__category-arrow', {
                                                                    'db-toolbox__category-arrow--active':
                                                                        is_sub_category_open,
                                                                })}
                                                            >
                                                                <LabelPairedChevronDownMdFillIcon fill='var(--text-general)' />
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                {has_sub_category &&
                                                    is_sub_category_open &&
                                                    (Array.from(category.childNodes) as HTMLElement[]).map(
                                                        subCategory => {
                                                            return (
                                                                <div
                                                                    key={`db-toolbox__sub-category-row--${subCategory.getAttribute(
                                                                        'id'
                                                                    )}`}
                                                                    className={classNames(
                                                                        'db-toolbox__sub-category-row',
                                                                        {
                                                                            'db-toolbox__sub-category-row--active':
                                                                                selected_category?.getAttribute(
                                                                                    'id'
                                                                                ) === subCategory?.id,
                                                                            'db-toolbox__sub-category-row--pending':
                                                                                pending_selection ===
                                                                                subCategory?.getAttribute('id'),
                                                                        }
                                                                    )}
                                                                    onClick={() => {
                                                                        handleCategoryClick(subCategory);
                                                                    }}
                                                                >
                                                                    <Text size='xxs'>
                                                                        {subCategory.getAttribute('name') as string}
                                                                    </Text>
                                                                </div>
                                                            );
                                                        }
                                                    )}
                                            </div>
                                        );
                                    }
                                    return null;
                                })}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
});

export default Toolbox;
