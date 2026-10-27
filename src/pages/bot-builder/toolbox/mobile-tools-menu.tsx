// @ts-nocheck — vendored bot code with known upstream type gaps; see AGENTS.md
import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { LabelPairedChevronDownMdFillIcon } from '@deriv/quill-icons/LabelPaired';
import { localize } from '@deriv-com/translations';
import BlocksPalette from './blocks-palette';
import './mobile-tools-menu.scss';

/**
 * Below the desktop breakpoint there is no room for a docked palette or a standalone Quick strategy
 * button, so both live in one collapsible menu at the top of the canvas: "Quick strategy" opens the
 * guided form, "Blocks" expands the palette, whose list scrolls to its last category.
 */
const MobileToolsMenu = observer(() => {
    const { quick_strategy } = useStore();
    const { setFormVisibility } = quick_strategy;
    const [is_open, setOpen] = React.useState(false);
    const [is_blocks_open, setBlocksOpen] = React.useState(true);

    const handleQuickStrategyOpen = () => {
        setFormVisibility(true);
        setOpen(false);
    };

    return (
        <div
            className={classNames('db-mobile-tools', { 'db-mobile-tools--open': is_open })}
            data-testid='db-mobile-tools'
        >
            <button
                type='button'
                className='db-mobile-tools__toggle'
                data-testid='db-mobile-tools__toggle'
                aria-expanded={is_open}
                aria-controls='db-mobile-tools__body'
                onClick={() => setOpen(!is_open)}
            >
                <span>{localize('Quick strategy & blocks')}</span>
                <LabelPairedChevronDownMdFillIcon
                    className='db-mobile-tools__toggle-icon'
                    fill='var(--text-general)'
                />
            </button>
            {is_open && (
                <div className='db-mobile-tools__body' id='db-mobile-tools__body'>
                    <button
                        type='button'
                        className='db-mobile-tools__action'
                        data-testid='db-mobile-tools__quick-strategy'
                        onClick={handleQuickStrategyOpen}
                    >
                        <span className='db-mobile-tools__action-title'>{localize('Quick strategy')}</span>
                        <span className='db-mobile-tools__action-hint'>
                            {localize('Guided setup for a ready-made bot')}
                        </span>
                    </button>
                    <div className='db-mobile-tools__section'>
                        <button
                            type='button'
                            className='db-mobile-tools__section-header'
                            data-testid='db-mobile-tools__blocks-header'
                            aria-expanded={is_blocks_open}
                            onClick={() => setBlocksOpen(!is_blocks_open)}
                        >
                            <span>{localize('Blocks')}</span>
                            <LabelPairedChevronDownMdFillIcon
                                className={classNames('db-mobile-tools__section-chevron', {
                                    'db-mobile-tools__section-chevron--open': is_blocks_open,
                                })}
                                fill='var(--text-general)'
                            />
                        </button>
                        {is_blocks_open && (
                            <div className='db-mobile-tools__palette' data-testid='db-mobile-tools__palette'>
                                <BlocksPalette onCategoryPicked={() => setOpen(false)} />
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
});

export default MobileToolsMenu;
