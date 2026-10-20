type TTabsTitle = {
    [key: string]: string | number;
};

type TDashboardTabIndex = {
    [key: string]: number;
};

export const tabs_title: TTabsTitle = Object.freeze({
    WORKSPACE: 'Workspace',
    CHART: 'Chart',
});

export const DBOT_TABS: TDashboardTabIndex = Object.freeze({
    DASHBOARD: 0,
    FREE_BOTS: 1,
    BOT_BUILDER: 2,
    STRATEGY_ENGINE: 3,
    CHART: 4,
    DIGITS: 5,
    STATISTICS: 6,
});

export const MAX_STRATEGIES = 10;

export const TAB_IDS = [
    'id-dbot-dashboard',
    'id-free-bots',
    'id-bot-builder',
    'id-strategy-engine',
    'id-charts',
    'id-digits',
    'id-statistics',
];

export const DEBOUNCE_INTERVAL_TIME = 500;
