/**
 * The Bot tab.
 *
 * A menu-driven way to say which blocks the bot is made of: pick a block from the block menu (every
 * block in the Bot Builder palette, the bot blocks included), set its options in the menus that
 * appear, then open the selection in the Bot Builder, which loads those blocks onto its canvas.
 *
 * Labels and option choices come from the registered Blockly definitions, so the tab loads Blockly
 * itself when the Bot Builder has not been opened yet in this session.
 */
import React from 'react';
import { observer } from 'mobx-react-lite';
import SelectNative from '@/components/shared_ui/select-native';
import { DBOT_TABS } from '@/constants/bot-contents';
import { loadBlockly } from '@/external/bot-skeleton/scratch/blockly';
import { useStore } from '@/hooks/useStore';
import useThemeSwitcher from '@/hooks/useThemeSwitcher';
import { getBlockFields, getCatalogGroups, TBotBlockField } from './bot-block-catalog';
import {
    markSelectionPending,
    readSavedSelection,
    saveSelection,
    TBotSelection,
    TBotSelectionEntry,
} from './bot-selection-store';
import './bot-page.scss';

const emptyEntry = (): TBotSelectionEntry => ({ type: '', values: {} });

const BotPage = observer(() => {
    const { dashboard } = useStore();
    const { is_dark_mode_on } = useThemeSwitcher();
    const [blockly_ready, setBlocklyReady] = React.useState(() => Boolean((window as any).Blockly?.Blocks));
    const [selection, setSelection] = React.useState<TBotSelection>(() => {
        const saved = readSavedSelection();
        return saved.length ? saved : [emptyEntry()];
    });

    // The block names and their option menus live in the registered Blockly definitions.
    React.useEffect(() => {
        if (blockly_ready) return;
        let cancelled = false;
        loadBlockly(is_dark_mode_on)
            .then(() => !cancelled && setBlocklyReady(true))
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [blockly_ready, is_dark_mode_on]);

    React.useEffect(() => {
        saveSelection(selection.filter(entry => entry.type));
    }, [selection]);

    // One menu holding every palette block, grouped by the palette's own categories.
    const block_menu = React.useMemo(() => {
        if (!blockly_ready) return [];
        return getCatalogGroups().flatMap(group =>
            group.blocks.map(block => ({ text: block.label, value: block.type, group: group.name }))
        );
    }, [blockly_ready]);

    const selected_blocks = selection.filter(entry => entry.type);

    const updateEntry = (index: number, changes: Partial<TBotSelectionEntry>) => {
        setSelection(current =>
            current.map((entry, position) => (position === index ? { ...entry, ...changes } : entry))
        );
    };

    const updateValue = (index: number, name: string, value: string) => {
        setSelection(current =>
            current.map((entry, position) =>
                position === index ? { ...entry, values: { ...entry.values, [name]: value } } : entry
            )
        );
    };

    const openInBotBuilder = () => {
        markSelectionPending(selected_blocks);
        dashboard.setActiveTab(DBOT_TABS.BOT_BUILDER);
    };

    const renderField = (index: number, entry: TBotSelectionEntry, field: TBotBlockField) => {
        const value = entry.values[field.name] ?? field.value;

        if (field.kind === 'select') {
            return (
                <SelectNative
                    key={field.name}
                    className='bot-config__field'
                    label={field.label}
                    list_items={(field.options ?? []).map(option => ({ text: option.label, value: option.value }))}
                    should_show_empty_option={false}
                    value={value}
                    onChange={event => updateValue(index, field.name, (event.target as HTMLSelectElement).value)}
                />
            );
        }

        return (
            <label key={field.name} className='bot-config__field bot-config__field--input'>
                <span className='bot-config__field-label'>{field.label}</span>
                <input
                    className='bot-config__input'
                    type={field.kind === 'number' ? 'number' : 'text'}
                    value={value}
                    onChange={event => updateValue(index, field.name, event.target.value)}
                />
            </label>
        );
    };

    return (
        <div className='bot-config'>
            <div className='bot-config__hero'>
                <h2 className='bot-config__title'>{'Bot'}</h2>
                <p className='bot-config__subtitle'>
                    {'Pick the blocks your bot is made of and set their options, then open them in the Bot Builder.'}
                </p>
            </div>

            {!blockly_ready ? (
                <div className='bot-config__status'>{'Loading the block menus…'}</div>
            ) : (
                <React.Fragment>
                    {selection.map((entry, index) => {
                        const fields = entry.type ? getBlockFields(entry.type) : { fields: [], has_live_fields: false };
                        return (
                            <div className='bot-config__row' key={index}>
                                <div className='bot-config__row-head'>
                                    <span className='bot-config__row-number'>{index + 1}</span>
                                    <SelectNative
                                        className='bot-config__block'
                                        label={'Block'}
                                        list_items={block_menu}
                                        placeholder={'Select a block'}
                                        value={entry.type}
                                        onChange={event =>
                                            updateEntry(index, {
                                                type: (event.target as HTMLSelectElement).value,
                                                values: {},
                                            })
                                        }
                                    />
                                    <button
                                        type='button'
                                        className='bot-config__remove'
                                        onClick={() =>
                                            setSelection(current =>
                                                current.length > 1
                                                    ? current.filter((_, position) => position !== index)
                                                    : [emptyEntry()]
                                            )
                                        }
                                    >
                                        {'Remove'}
                                    </button>
                                </div>

                                {entry.type && (
                                    <div className='bot-config__options'>
                                        {fields.fields.length ? (
                                            fields.fields.map(field => renderField(index, entry, field))
                                        ) : (
                                            <p className='bot-config__hint'>
                                                {'This block has no options to set here — it is configured on the canvas.'}
                                            </p>
                                        )}
                                        {fields.has_live_fields && (
                                            <p className='bot-config__hint'>
                                                {'Some options load live market data on the canvas, so they are set there.'}
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    <div className='bot-config__actions'>
                        <button
                            type='button'
                            className='bot-config__add'
                            onClick={() => setSelection(current => [...current, emptyEntry()])}
                        >
                            {'Add block'}
                        </button>
                        <button
                            type='button'
                            className='bot-config__open'
                            disabled={!selected_blocks.length}
                            onClick={openInBotBuilder}
                        >
                            {'Open in Bot Builder'}
                        </button>
                    </div>
                </React.Fragment>
            )}
        </div>
    );
});

export default BotPage;
