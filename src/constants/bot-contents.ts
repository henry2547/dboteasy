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
    BOT_BUILDER: 3,
    GUI_ENGINE: 4,
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
    'id-bot-builder',
    'id-gui-engine',
    'id-strategy-engine',
    'id-charts',
    'id-digits',
    'id-statistics',
];

export const DEBOUNCE_INTERVAL_TIME = 500;
