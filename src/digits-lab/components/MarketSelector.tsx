/**
 * Market selector with search, category filter, and open-only filter.
 */

import React, { useMemo, useState } from 'react';
import { useDigitsLab } from '../store';
import type { MarketCategory, MarketSymbol } from '../types';

const MarketSelector: React.FC = () => {
    const { markets, marketsLoading, marketsError, selectedMarket, selectMarket } = useDigitsLab();
    const [search, setSearch] = useState('');
    const [openOnly, setOpenOnly] = useState(true);
    const [activeCategory, setActiveCategory] = useState<MarketCategory | 'all'>('all');
    const [isOpen, setIsOpen] = useState(false);

    const categories = useMemo(() => {
        const set = new Set<MarketCategory>();
        markets.forEach((m) => set.add(m.category));
        return Array.from(set);
    }, [markets]);

    const filtered = useMemo(() => {
        return markets.filter((m) => {
            if (openOnly && m.availability !== 'available') return false;
            if (activeCategory !== 'all' && m.category !== activeCategory) return false;
            if (search) {
                const q = search.toLowerCase();
                if (!m.displayName.toLowerCase().includes(q) && !m.apiSymbol.toLowerCase().includes(q)) return false;
            }
            return true;
        });
    }, [markets, openOnly, activeCategory, search]);

    const handleSelect = (market: MarketSymbol) => {
        selectMarket(market);
        setIsOpen(false);
    };

    if (marketsLoading) {
        return <div className="dl-market-selector dl-market-selector--loading">Loading markets…</div>;
    }

    if (marketsError) {
        return <div className="dl-market-selector dl-market-selector--error">Error: {marketsError}</div>;
    }

    return (
        <div className="dl-market-selector">
            <button
                className="dl-market-selector__trigger"
                onClick={() => setIsOpen(!isOpen)}
                aria-expanded={isOpen}
            >
                <span className="dl-market-selector__current">
                    {selectedMarket ? (
                        <>
                            <strong>{selectedMarket.displayName}</strong>
                            <span className="dl-market-selector__symbol">{selectedMarket.apiSymbol}</span>
                            <span className={`dl-market-selector__status dl-market-selector__status--${selectedMarket.availability}`}>
                                {selectedMarket.availability}
                            </span>
                        </>
                    ) : (
                        'Select a market…'
                    )}
                </span>
                <span className="dl-market-selector__chevron">{isOpen ? '▲' : '▼'}</span>
            </button>

            {isOpen && (
                <div className="dl-market-selector__dropdown">
                    <div className="dl-market-selector__search">
                        <input
                            type="text"
                            placeholder="Search markets…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            autoFocus
                        />
                    </div>
                    <div className="dl-market-selector__filters">
                        <label className="dl-checkbox">
                            <input
                                type="checkbox"
                                checked={openOnly}
                                onChange={(e) => setOpenOnly(e.target.checked)}
                            />
                            Open only
                        </label>
                        <select
                            value={activeCategory}
                            onChange={(e) => setActiveCategory(e.target.value as MarketCategory | 'all')}
                        >
                            <option value="all">All categories</option>
                            {categories.map((cat) => (
                                <option key={cat} value={cat}>
                                    {cat}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="dl-market-selector__list">
                        {filtered.length === 0 ? (
                            <div className="dl-market-selector__empty">No markets found</div>
                        ) : (
                            filtered.map((m) => (
                                <button
                                    key={m.apiSymbol}
                                    className={`dl-market-option ${selectedMarket?.apiSymbol === m.apiSymbol ? 'dl-market-option--selected' : ''}`}
                                    onClick={() => handleSelect(m)}
                                >
                                    <span className="dl-market-option__name">{m.displayName}</span>
                                    <span className="dl-market-option__meta">
                                        <span className="dl-market-option__symbol">{m.apiSymbol}</span>
                                        <span className={`dl-market-option__status dl-market-option__status--${m.availability}`}>
                                            {m.availability}
                                        </span>
                                    </span>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default MarketSelector;
