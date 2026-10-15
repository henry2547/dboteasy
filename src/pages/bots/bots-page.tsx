import { useState } from 'react';
import './bots-page.scss';

interface BotsPageProps {
    /** Switches the app to the Bot Builder tab so the user can place the blocks. */
    onOpenBuilder?: () => void;
}

interface BotTemplate {
    id: string;
    name: string;
    contract: string;
    summary: string;
    settings: string[];
}

/**
 * Ready-made digit-market bot recipes. Each card describes a bot the user can
 * assemble in the Bot Builder, and the collapsible panel explains how to load
 * and configure it.
 */
const BOT_TEMPLATES: BotTemplate[] = [
    {
        id: 'over-under',
        name: 'Over / Under Bot',
        contract: 'Digits Over / Under',
        summary: 'Buys the side of the barrier the digits have been respecting.',
        settings: [
            'Market: Volatility 100 (1s) or Volatility 100 Index',
            'Contract: Digits Over/Under',
            'Barrier: Over 2 (digits 3–9) or Under 7 (digits 0–6)',
            'Prediction: Over or Under',
            'Stake: 0.35 USD · Duration: 1 tick',
        ],
    },
    {
        id: 'even-odd',
        name: 'Even / Odd Bot',
        contract: 'Digits Even / Odd',
        summary: 'Trades the parity that is currently ahead of its 50% baseline.',
        settings: [
            'Market: any volatility index',
            'Contract: Digits Even/Odd',
            'Prediction: Even or Odd',
            'Stake: 0.35 USD · Duration: 1 tick',
        ],
    },
    {
        id: 'matches-differs',
        name: 'Matches / Differs Bot',
        contract: 'Digits Matches / Differs',
        summary: 'Targets a single digit — wins when it matches (or avoids it when it differs).',
        settings: [
            'Market: any volatility index',
            'Contract: Digits Matches/Differs',
            'Prediction: the digit to match or differ from',
            'Stake: 0.35 USD · Duration: 1 tick',
        ],
    },
];

const LOAD_STEPS = [
    'Open the Bot Builder tab and clear the canvas (right-click → Delete, or drag blocks to the bin).',
    'Open the Blocks menu and drag a trade block into the canvas, then pick the digit contract you want.',
    'Set the market, barrier or prediction, stake and duration from the settings list on the bot card.',
    'Add a purchase condition (for example “last digit is greater than 2”) and connect it to the trade block.',
    'Press Run and watch the Journal for each result. Stop any time with the stop button.',
    'Save the bot from the toolbar so you can load it again later.',
];

export default function BotsPage({ onOpenBuilder }: BotsPageProps) {
    const [isGuideOpen, setGuideOpen] = useState(true);
    const [openBotId, setOpenBotId] = useState<string | null>(BOT_TEMPLATES[0].id);

    return (
        <div className='bots'>
            <header className='bots-hero'>
                <h2 className='bots-hero__title'>Trading bots</h2>
                <p className='bots-hero__subtitle'>
                    Digit-market bots you can build in the Bot Builder — Over/Under, Even/Odd and Matches/Differs.
                </p>
            </header>

            <section className='bots-guide'>
                <button
                    type='button'
                    className='bots-guide__toggle'
                    onClick={() => setGuideOpen(open => !open)}
                    aria-expanded={isGuideOpen}
                >
                    <span>How to load and configure a bot</span>
                    <span className='bots-guide__chevron' aria-hidden='true'>
                        {isGuideOpen ? '▲' : '▼'}
                    </span>
                </button>

                {isGuideOpen && (
                    <ol className='bots-guide__steps'>
                        {LOAD_STEPS.map(step => (
                            <li key={step}>{step}</li>
                        ))}
                    </ol>
                )}
            </section>

            <div className='bots-list'>
                {BOT_TEMPLATES.map(bot => {
                    const isOpen = openBotId === bot.id;
                    return (
                        <article key={bot.id} className={'bots-card' + (isOpen ? ' bots-card--open' : '')}>
                            <button
                                type='button'
                                className='bots-card__head'
                                onClick={() => setOpenBotId(isOpen ? null : bot.id)}
                                aria-expanded={isOpen}
                            >
                                <span className='bots-card__titles'>
                                    <span className='bots-card__name'>{bot.name}</span>
                                    <span className='bots-card__contract'>{bot.contract}</span>
                                </span>
                                <span className='bots-card__chevron' aria-hidden='true'>
                                    {isOpen ? '▲' : '▼'}
                                </span>
                            </button>

                            {isOpen && (
                                <div className='bots-card__body'>
                                    <p className='bots-card__summary'>{bot.summary}</p>
                                    <h4 className='bots-card__settings-title'>Settings</h4>
                                    <ul className='bots-card__settings'>
                                        {bot.settings.map(setting => (
                                            <li key={setting}>{setting}</li>
                                        ))}
                                    </ul>
                                    {onOpenBuilder && (
                                        <button
                                            type='button'
                                            className='bots-card__action'
                                            onClick={onOpenBuilder}
                                        >
                                            Open in Bot Builder
                                        </button>
                                    )}
                                </div>
                            )}
                        </article>
                    );
                })}
            </div>

            <p className='bots-disclaimer'>
                These are starting templates, not financial advice. Test on a demo account first.
            </p>
        </div>
    );
}
