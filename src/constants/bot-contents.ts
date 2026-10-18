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
    BOT_BUILDER: 1,
    STRATEGY_ENGINE: 2,
    CHART: 3,
    DIGITS: 4,
    STATISTICS: 5,
});

export const MAX_STRATEGIES = 10;

export const TAB_IDS = [
    'id-dbot-dashboard',
    'id-bot-builder',
    'id-strategy-engine',
    'id-charts',
    'id-digits',
    'id-statistics',
];

export const DEBOUNCE_INTERVAL_TIME = 500;
