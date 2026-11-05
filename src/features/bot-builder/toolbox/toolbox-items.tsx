import React from 'react';
import ReactDomServer from 'react-dom/server';
import { AnalysisCategory } from './palette/analysis-category';
import { PaletteExamples } from './palette/examples';
import { ObserverGroups } from './palette/observer-groups';
import { Xml } from './palette/tags';
import { TradeCategories } from './palette/trade-categories';
import { TradingCategories } from './palette/trading-categories';
import { UtilityCategory } from './palette/utility-category';

/**
 * The Bot Builder's Blocks menu, as static markup the toolbox mounts.
 *
 * Each palette section is its own module under `palette/` so a block lives next to the
 * category it belongs to instead of in one 2000-line file:
 * - `trade-categories.tsx` — Trade parameters / Purchase / Sell / Restart conditions
 * - `trading-categories.tsx` — Digits, Market Intelligence, Risk, Strategy Learning,
 *   Trading & Execution, Bot Control, Reporting
 * - `observer-groups.tsx` — the four observer groups, read from `observer-catalog.js`
 * - `analysis-category.tsx` — Analysis (indicators, tick/candle analysis, contract, stats)
 * - `utility-category.tsx` — Utility (functions, variables, notifications, time, math,
 *   text, logic, lists, loops, miscellaneous)
 * - `examples.tsx` — the stock Blockly examples
 */
export const ToolboxItems = () =>
    ReactDomServer.renderToStaticMarkup(
        <Xml xmlns='http://www.w3.org/1999/xhtml' id='toolbox'>
            <TradeCategories />
            <TradingCategories />
            <ObserverGroups />
            <AnalysisCategory />
            <UtilityCategory />
            <PaletteExamples />
        </Xml>
    );
