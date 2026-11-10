import { DBOT_TABS, TAB_IDS } from '@/constants/bot-contents';
import { useStore } from '@/hooks/useStore';
import './app-guide-submenu.scss';

type TAppGuideSubmenu = {
    /** Closes the drawer once a destination has been opened. */
    onNavigate: () => void;
};

type TDestination = {
    tab: number;
    name: string;
    hint: string;
};

/**
 * The Help entry in the hamburger menu. Instead of explaining the analysis panels it is a
 * map of the app: every tab with one line on what it is for, and a tap that opens it. The
 * hamburger is shown at every width, so this is the one place that answers "where do I find
 * X?".
 */
const DESTINATIONS: TDestination[] = [
    {
        tab: DBOT_TABS.DASHBOARD,
        name: 'Dashboard',
        hint: 'Start here — load a saved bot, open the builder, or start a quick strategy.',
    },
    {
        tab: DBOT_TABS.AI_ARCHITECT,
        name: 'AI Builder',
        hint: 'Describe the bot you want in words and the AI assembles it for you.',
    },
    {
        tab: DBOT_TABS.FREE_BOTS,
        name: 'Free Bots',
        hint: 'Ready-made digit bots — open one and load it straight into the builder.',
    },
    {
        tab: DBOT_TABS.BOT_BUILDER,
        name: 'Bot Builder',
        hint: 'Drag blocks onto the canvas to build or change a bot, then hit Run.',
    },
    {
        tab: DBOT_TABS.STRATEGY_ENGINE,
        name: 'Strategy Engine',
        hint: 'Live digit-market evaluation and entry-threshold monitoring.',
    },
    {
        tab: DBOT_TABS.CHART,
        name: 'Deriv Chart',
        hint: 'The full chart of the market you are trading.',
    },
    {
        tab: DBOT_TABS.DIGITS,
        name: 'Digits',
        hint: 'Digit frequency, barriers and strategy signals for the market you pick.',
    },
    {
        tab: DBOT_TABS.STATISTICS,
        name: 'Statistics',
        hint: 'The numbers behind the market you analysed on the Digits tab.',
    },
];

const TIPS = [
    'The tab bar at the top scrolls sideways — swipe it to reach the last tabs.',
    'Scan markets (the floating button) ranks every volatility market and loads a bot that fits.',
    'Summary, Transactions and Journal open from the handle at the bottom; Run and Stop live there too.',
];

export default function AppGuideSubmenu({ onNavigate }: TAppGuideSubmenu) {
    const { dashboard } = useStore();

    const openTab = (tab: number) => {
        dashboard.setActiveTab(tab);
        onNavigate();
        // The tab bar scrolls sideways on a phone, so bring the tab just opened into view.
        document.getElementById(TAB_IDS[tab])?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    };

    return (
        <div className='app-guide'>
            <p className='app-guide__intro'>Tap any tab to open it. Everything in the app is one of these.</p>

            <ol className='app-guide__list'>
                {DESTINATIONS.map((destination, index) => (
                    <li key={destination.tab}>
                        <button type='button' className='app-guide__item' onClick={() => openTab(destination.tab)}>
                            <span className='app-guide__number' aria-hidden='true'>
                                {index + 1}
                            </span>
                            <span className='app-guide__text'>
                                <span className='app-guide__name'>{destination.name}</span>
                                <span className='app-guide__hint'>{destination.hint}</span>
                            </span>
                            <span className='app-guide__arrow' aria-hidden='true'>
                                →
                            </span>
                        </button>
                    </li>
                ))}
            </ol>

            <div className='app-guide__tips'>
                <h3 className='app-guide__tips-title'>Getting around</h3>
                <ul>
                    {TIPS.map(tip => (
                        <li key={tip}>{tip}</li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
