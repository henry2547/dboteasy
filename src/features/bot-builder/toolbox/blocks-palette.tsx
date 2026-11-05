// @ts-nocheck — vendored bot code with known upstream type gaps; see AGENTS.md
import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import Text from '@/components/shared_ui/text';
import { useStore } from '@/hooks/useStore';
import { LabelPairedChevronDownMdFillIcon } from '@deriv/quill-icons/LabelPaired';
import { localize } from '@deriv-com/translations';
import SearchBox from './search-box';

type TBlocksPaletteProps = {
    /** Called after a category was chosen — the mobile menu closes so the flyout is not covered. */
    onCategoryPicked?: () => void;
};

/**
 * The search box plus the category rows of the Blocks menu. It is rendered by the docked palette on a
 * desktop and inside the collapsible "Quick strategy & blocks" menu on a phone, so the list itself
 * carries no positioning or collapse behaviour.
 */
const BlocksPalette = observer(({ onCategoryPicked }: TBlocksPaletteProps) => {
    const { toolbox, flyout } = useStore();
    const {
        hasSubCategory,
        is_search_loading,
        onSearch,
        onSearchBlur,
        onSearchClear,
        onSearchKeyUp,
        onToolboxItemClick,
        onToolboxItemExpand,
        sub_category_index,
        toolbox_dom,
    } = toolbox;
    const { selected_category } = flyout;
    const [pending_selection] = React.useState<string | null>(null);

    const handleCategoryClick = (category: HTMLElement) => {
        onToolboxItemClick(category);
        onCategoryPicked?.();
    };

    return (
        <>
            <SearchBox
                is_search_loading={is_search_loading}
                onSearch={onSearch}
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
                                                        'db-toolbox__category-arrow--active': is_sub_category_open,
                                                    })}
                                                >
                                                    <LabelPairedChevronDownMdFillIcon fill='var(--text-general)' />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    {has_sub_category &&
                                        is_sub_category_open &&
                                        (Array.from(category.childNodes) as HTMLElement[]).map(subCategory => {
                                            return (
                                                <div
                                                    key={`db-toolbox__sub-category-row--${subCategory.getAttribute(
                                                        'id'
                                                    )}`}
                                                    className={classNames('db-toolbox__sub-category-row', {
                                                        'db-toolbox__sub-category-row--active':
                                                            selected_category?.getAttribute('id') === subCategory?.id,
                                                        'db-toolbox__sub-category-row--pending':
                                                            pending_selection === subCategory?.getAttribute('id'),
                                                    })}
                                                    onClick={() => {
                                                        handleCategoryClick(subCategory);
                                                    }}
                                                >
                                                    <Text size='xxs'>
                                                        {subCategory.getAttribute('name') as string}
                                                    </Text>
                                                </div>
                                            );
                                        })}
                                </div>
                            );
                        }
                        return null;
                    })}
            </div>
        </>
    );
});

export default BlocksPalette;
