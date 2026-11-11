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
    AI_ARCHITECT: 1,
    FREE_BOTS: 2,
    AI_BOTS: 3,
    BOT_BUILDER: 4,
    STRATEGY_ENGINE: 5,
    CHART: 6,
    DIGITS: 7,
    STATISTICS: 8,
});

export const MAX_STRATEGIES = 10;

export const TAB_IDS = [
    'id-dbot-dashboard',
    'id-ai-architect',
    'id-free-bots',
    'id-ai-bots',
    'id-bot-builder',
    'id-strategy-engine',
    'id-charts',
    'id-digits',
    'id-statistics',
];

export const DEBOUNCE_INTERVAL_TIME = 500;
