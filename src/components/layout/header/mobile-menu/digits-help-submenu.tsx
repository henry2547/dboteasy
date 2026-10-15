import { useState, type ReactNode } from 'react';
import './digits-help-submenu.scss';

interface HelpSection {
    id: string;
    title: string;
    body: () => ReactNode;
}

/**
 * Plain-language help for the Digits and Statistics tabs, reachable from the
 * hamburger menu. Explains each panel and, in particular, what the “Touched /
 * After” figures on the barrier cards mean.
 */
export default function DigitsHelpSubmenu() {
    const [openId, setOpenId] = useState<string>('barriers');

    const sections: HelpSection[] = [
        {
            id: 'tabs',
            title: 'What each tab is for',
            body: () => (
                <ul className='digits-help__list'>
                    <li>
                        <strong>Digits</strong> — live analysis of the selected volatility market: how often each digit
                        appears, the barrier behaviour and the strategy learning.
                    </li>
                    <li>
                        <strong>Bots</strong> — ready-made digit bots (Over/Under, Even/Odd, Matches/Differs) with the
                        steps to build them.
                    </li>
                    <li>
                        <strong>Statistics</strong> — the detail view of the market you selected on the Digits tab: raw
                        digit history and the numbers behind it.
                    </li>
                </ul>
            ),
        },
        {
            id: 'reading',
            title: 'Reading a market',
            body: () => (
                <div className='digits-help__body'>
                    <p>
                        Every digit should appear about <strong>10%</strong> of the time. The frequency cards, the bar
                        chart and the digit circle all show the same thing from different angles, so you can spot which
                        digits are running hot and which are cold.
                    </p>
                    <p>
                        The <strong>cursor</strong> on the chart and circle follows the last digit the ticker landed
                        on, so you can watch the movement tick by tick.
                    </p>
                </div>
            ),
        },
        {
            id: 'barriers',
            title: 'Barrier behaviour — “Touched” and “After”',
            body: () => (
                <div className='digits-help__body'>
                    <p>
                        Each barrier card (Over 2, Over 1, Under 8, Under 7) looks at the digits either side of the
                        barrier, because those are the “near misses” that matter most.
                    </p>

                    <div className='digits-help__example'>
                        <div className='digits-help__example-head'>Under 8 · example</div>
                        <ul className='digits-help__example-grid'>
                            <li>
                                <span>Touched 7</span>
                                <strong>104</strong>
                                <em>Times the last digit was 7 — one below the barrier.</em>
                            </li>
                            <li>
                                <span>Touched 9</span>
                                <strong>84</strong>
                                <em>Times the last digit was 9 — one above the barrier.</em>
                            </li>
                            <li>
                                <span>After 7</span>
                                <strong>digit 3</strong>
                                <em>Once a 7 appeared, the next digit was most often 3.</em>
                            </li>
                            <li>
                                <span>After 9</span>
                                <strong>digit 2</strong>
                                <em>Once a 9 appeared, the next digit was most often 2.</em>
                            </li>
                        </ul>
                    </div>

                    <div className='digits-help__diagram' aria-hidden='true'>
                        <span className='digits-help__chip'>… 6</span>
                        <span className='digits-help__chip digits-help__chip--hit'>7</span>
                        <span className='digits-help__arrow'>→</span>
                        <span className='digits-help__chip'>3</span>
                        <span className='digits-help__note'>After a 7, a 3 followed most often</span>
                    </div>

                    <p className='digits-help__hint'>
                        Use these to judge whether a barrier is being respected and which digit tends to follow a
                        touch.
                    </p>
                </div>
            ),
        },
        {
            id: 'strategy',
            title: 'Strategy learning',
            body: () => (
                <div className='digits-help__body'>
                    <p>
                        Each rule (Over 1, Over 2, Under 7, Under 8, Even, Odd) shows its overall hit-rate and its
                        recent hit-rate. A green <strong>Enter</strong> badge means the recent hit-rate is holding an
                        edge; <strong>Skip</strong> means no edge or a losing run.
                    </p>
                    <p>
                        The <strong>Market conditions</strong> panel turns all of this into a plain summary, including
                        which digit to enter behind the barrier for Over 2 and preferring 5 or 6 for Over 1.
                    </p>
                </div>
            ),
        },
        {
            id: 'scanner',
            title: 'Scanning the markets',
            body: () => (
                <div className='digits-help__body'>
                    <p>
                        The floating <strong>Scan markets</strong> button checks every volatility market and ranks them
                        by how orderly their digits currently are. Tap a market in the list to switch the whole tab to
                        it.
                    </p>
                </div>
            ),
        },
    ];

    return (
        <div className='digits-help'>
            <p className='digits-help__intro'>
                A short guide to the digit tools. Tap a topic to expand it.
            </p>

            {sections.map(section => {
                const isOpen = openId === section.id;
                return (
                    <section key={section.id} className='digits-help__section'>
                        <button
                            type='button'
                            className='digits-help__toggle'
                            onClick={() => setOpenId(isOpen ? '' : section.id)}
                            aria-expanded={isOpen}
                        >
                            <span>{section.title}</span>
                            <span className='digits-help__chevron' aria-hidden='true'>
                                {isOpen ? '▲' : '▼'}
                            </span>
                        </button>
                        {isOpen && <div className='digits-help__content'>{section.body()}</div>}
                    </section>
                );
            })}
        </div>
    );
}
