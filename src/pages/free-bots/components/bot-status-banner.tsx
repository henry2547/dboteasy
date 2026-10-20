import { observer } from 'mobx-react-lite';
import { useFreeBotLoader } from '../use-free-bot-loader';

interface BotStatusBannerProps {
    /** `overlay` floats over the Bot Builder canvas, `panel` sits in the page. */
    variant?: 'panel' | 'overlay';
}

/**
 * The loaded-bot banner. Every line is read from the live load state and from
 * the run panel — the status never claims more than the app can prove, and the
 * bot only runs when the user presses Start bot.
 */
const BotStatusBanner = observer(({ variant = 'panel' }: BotStatusBannerProps) => {
    const { bot, validateBot, startBot, stopBot, clearBot, isRunning, validated, startError } = useFreeBotLoader();

    if (!bot) return null;

    const status = bot.errorMessage
        ? 'Not ready — see the problems below'
        : isRunning
          ? 'Running — confirmed by the execution engine'
          : validated
            ? 'Validated — press Start bot to trade'
            : 'Ready to validate';

    const statusTone = bot.errorMessage ? 'error' : isRunning ? 'live' : validated ? 'ok' : 'idle';

    return (
        <section className={`bot-banner bot-banner--${variant}`} aria-label='Loaded bot'>
            <header className='bot-banner__head'>
                <h3 className='bot-banner__title'>{bot.name} — loaded into Bot Builder</h3>
                <span className={`bot-banner__status bot-banner__status--${statusTone}`}>{status}</span>
            </header>

            <dl className='bot-banner__facts'>
                <div>
                    <dt>Market</dt>
                    <dd>
                        {bot.market.symbol} — {bot.market.displayName}
                    </dd>
                </div>
                <div>
                    <dt>Strategy</dt>
                    <dd>
                        {bot.strategyLabel} · {bot.contractType} · prediction {bot.prediction}
                    </dd>
                </div>
                <div>
                    <dt>Account</dt>
                    <dd>
                        {bot.accountMode}
                        {bot.loginid ? ` · ${bot.loginid}` : ''}
                    </dd>
                </div>
                <div>
                    <dt>Loaded from</dt>
                    <dd>
                        {bot.marketSource === 'scanner' ? 'Market scanner result' : 'Free Bots library'} ·{' '}
                        {bot.sourceFile}
                    </dd>
                </div>
            </dl>

            {bot.validationChecks.length > 0 && (
                <ul className='bot-banner__checks'>
                    {bot.validationChecks.map(check => (
                        <li key={check.id} className={check.passed ? 'bot-banner__check--ok' : 'bot-banner__check--fail'}>
                            <span aria-hidden='true'>{check.passed ? '✓' : '✗'}</span> {check.label}
                            <span className='bot-banner__check-detail'> — {check.detail}</span>
                        </li>
                    ))}
                </ul>
            )}

            {bot.errorMessage && <p className='bot-banner__error'>{bot.errorMessage}</p>}
            {!bot.errorMessage && bot.validationErrors.length > 0 && (
                <ul className='bot-banner__errors'>
                    {bot.validationErrors.map(error => (
                        <li key={error}>{error}</li>
                    ))}
                </ul>
            )}
            {startError && <p className='bot-banner__error'>{startError}</p>}

            <div className='bot-banner__actions'>
                <button type='button' className='free-bots-button' onClick={validateBot}>
                    Validate bot
                </button>
                <button
                    type='button'
                    className='free-bots-button free-bots-button--primary'
                    onClick={startBot}
                    disabled={!validated || isRunning}
                    title={
                        validated
                            ? 'Start the bot — this places trades on the authorized account'
                            : 'Validate the bot successfully before starting it'
                    }
                >
                    Start bot
                </button>
                {isRunning && (
                    <button type='button' className='free-bots-button free-bots-button--danger' onClick={stopBot}>
                        Stop bot
                    </button>
                )}
                {variant === 'overlay' && (
                    <button type='button' className='free-bots-button' onClick={clearBot}>
                        Close
                    </button>
                )}
            </div>

            <p className='bot-banner__note'>
                Loading a bot places no trade. Nothing runs until you press Start bot, and Demo is the safe first test.
            </p>
        </section>
    );
});

export default BotStatusBanner;
