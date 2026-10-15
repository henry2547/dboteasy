import { useMemo, useState } from 'react';
import { decimalsFromPipIncrement } from '../precision';
import type { MarketSymbol } from '../types';

interface MarketSelectorProps {
    markets: MarketSymbol[];
    selectedMarket: MarketSymbol | null;
    onSelect: (market: MarketSymbol) => void;
    disabled?: boolean;
}

const ALL = 'all';

export default function MarketSelector({ markets, selectedMarket, onSelect, disabled }: MarketSelectorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState(ALL);
    const [openOnly, setOpenOnly] = useState(true);

    const categories = useMemo(() => {
        const seen: string[] = [];
        markets.forEach(market => {
            if (!seen.includes(market.category)) seen.push(market.category);
        });
        return seen;
    }, [markets]);

    const filtered = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return markets
            .filter(market => {
                if (openOnly && !market.isOpen) return false;
                if (category !== ALL && market.category !== category) return false;
                if (!needle) return true;
                return (
                    market.displayName.toLowerCase().includes(needle) ||
                    market.apiSymbol.toLowerCase().includes(needle) ||
                    market.category.toLowerCase().includes(needle)
                );
            })
            .sort((a, b) => a.displayName.localeCompare(b.displayName));
    }, [markets, query, category, openOnly]);

    const handleSelect = (market: MarketSymbol) => {
        onSelect(market);
        setIsOpen(false);
    };

    return (
        <div className='digits-market'>
            <button
                type='button'
                className='digits-market__trigger'
                onClick={() => setIsOpen(open => !open)}
                disabled={disabled}
                aria-expanded={isOpen}
            >
                <span className='digits-market__trigger-label'>
                    {selectedMarket ? selectedMarket.displayName : markets.length ? 'Choose a market' : 'Loading markets…'}
                </span>
                {selectedMarket && <span className='digits-market__trigger-symbol'>{selectedMarket.apiSymbol}</span>}
                <span className='digits-market__trigger-caret' aria-hidden='true'>
                    {isOpen ? '▲' : '▼'}
                </span>
            </button>

            {isOpen && (
                <div className='digits-market__panel'>
                    <div className='digits-market__filters'>
                        <input
                            className='digits-market__search'
                            type='search'
                            placeholder='Search markets…'
                            value={query}
                            onChange={event => setQuery(event.target.value)}
                        />
                        <select
                            className='digits-market__category'
                            value={category}
                            onChange={event => setCategory(event.target.value)}
                        >
                            <option value={ALL}>All categories</option>
                            {categories.map(name => (
                                <option key={name} value={name}>
                                    {name}
                                </option>
                            ))}
                        </select>
                        <label className='digits-market__toggle'>
                            <input
                                type='checkbox'
                                checked={openOnly}
                                onChange={event => setOpenOnly(event.target.checked)}
                            />
                            Open only
                        </label>
                    </div>

                    <div className='digits-market__list'>
                        {filtered.length === 0 && <p className='digits-market__empty'>No markets match your search.</p>}
                        {filtered.map(market => (
                            <button
                                type='button'
                                key={market.apiSymbol}
                                className={
                                    'digits-market__item' +
                                    (selectedMarket?.apiSymbol === market.apiSymbol ? ' digits-market__item--active' : '')
                                }
                                onClick={() => handleSelect(market)}
                            >
                                <span className='digits-market__item-main'>
                                    <span className='digits-market__item-name'>{market.displayName}</span>
                                    <span className='digits-market__item-meta'>
                                        {market.apiSymbol} · {market.category}
                                    </span>
                                </span>
                                <span className='digits-market__item-tags'>
                                    <span
                                        className={
                                            'digits-tag ' +
                                            (market.isOpen ? 'digits-tag--open' : 'digits-tag--closed')
                                        }
                                    >
                                        {market.isSuspended ? 'Suspended' : market.isOpen ? 'Open' : 'Closed'}
                                    </span>
                                    <span className='digits-tag digits-tag--muted'>
                                        {market.pipSize === null
                                            ? '—'
                                            : `${decimalsFromPipIncrement(market.pipSize) ?? '—'} dp`}
                                    </span>
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
