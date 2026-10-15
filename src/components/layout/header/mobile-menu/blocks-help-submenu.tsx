import { useState } from 'react';
import { localize } from '@deriv-com/translations';
import { BLOCK_GUIDE_GROUPS, TGuideEntry } from './blocks-help-data';
import './blocks-help-submenu.scss';

const BlockList = ({ entries }: { entries: TGuideEntry[] }) => (
    <ul className='blocks-help__blocks'>
        {entries.map(entry => (
            <li key={entry.name}>
                <span className='blocks-help__block-name'>{entry.name}</span>
                {entry.note && <span className='blocks-help__block-note'>{entry.note}</span>}
            </li>
        ))}
    </ul>
);

/**
 * How to use the blocks in the Blocks menu, group by group, reachable from the
 * hamburger menu. The observer groups are read straight from the block
 * catalogue so the guide cannot drift from the palette.
 */
export default function BlocksHelpSubmenu() {
    const [openId, setOpenId] = useState<string>(BLOCK_GUIDE_GROUPS[0].id);

    return (
        <div className='blocks-help'>
            <p className='blocks-help__intro'>
                {localize('How to use the blocks in the Blocks menu, group by group. Tap a group to expand it.')}
            </p>
            <p className='blocks-help__note'>
                {localize(
                    'Observational blocks describe what to watch and how to judge it — they do not place trades. Your Purchase blocks stay in 2. Purchase conditions.'
                )}
            </p>

            {BLOCK_GUIDE_GROUPS.map(group => {
                const isOpen = openId === group.id;
                return (
                    <section key={group.id} className='blocks-help__section'>
                        <button
                            type='button'
                            className='blocks-help__toggle'
                            onClick={() => setOpenId(isOpen ? '' : group.id)}
                            aria-expanded={isOpen}
                        >
                            <span>{group.title}</span>
                            <span className='blocks-help__chevron' aria-hidden='true'>
                                {isOpen ? '▲' : '▼'}
                            </span>
                        </button>

                        {isOpen && (
                            <div className='blocks-help__content'>
                                <p className='blocks-help__what'>{group.what}</p>

                                <p className='blocks-help__heading'>{localize('How to use it')}</p>
                                <ol className='blocks-help__steps'>
                                    {group.steps.map(step => (
                                        <li key={step}>{step}</li>
                                    ))}
                                </ol>

                                <p className='blocks-help__heading'>{localize('What is inside')}</p>
                                {group.blocks && <BlockList entries={group.blocks} />}
                                {group.categories?.map(category => (
                                    <div key={category.name} className='blocks-help__category'>
                                        <p className='blocks-help__category-name'>{category.name}</p>
                                        <BlockList entries={category.blocks} />
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                );
            })}
        </div>
    );
}
