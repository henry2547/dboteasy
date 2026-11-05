import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useApiBase } from '@/hooks/useApiBase';
import { useFreeBotLoader } from '../use-free-bot-loader';
import '../free-bots.scss';

interface BotStatusBannerProps {
    /** `overlay` floats over the Bot Builder canvas, `panel` sits in the page. */
    variant?: 'panel' | 'overlay';
}

/**
 * The loaded-bot banner. Every line is read from the live load state, the
 * header's authorized account and the run panel — the status never claims more
 * than the app can prove, the bot only runs when the user presses Start bot,
 * and a real-money start needs a second, explicit confirmation.
 */
const BotStatusBanner = observer(({ variant = 'panel' }: BotStatusBannerProps) => {
    const { bot, validateBot, startBot, stopBot, clearBot, isRunning, validated, startError } = useFreeBotLoader();
    const { activeLoginid } = useApiBase();
    const [confirmingReal, setConfirmingReal] = useState(false);

    // A new load, a stop or a fresh start cancels a pending confirmation, so a
    // real-money start can never be completed by a stale click.
    useEffect(() => {
        setConfirmingReal(false);
    }, [bot?.templateId, bot?.loadedAt, isRunning]);

    if (!bot) return null;

    const liveAccount: 'Demo' | 'Real' | 'Not signed in' = activeLoginid
        ? activeLoginid.startsWith('VR')
          ? 'Demo'
          : 'Real'
        : 'Not signed in';
    const accountChanged = !!bot.loginid && !!activeLoginid && bot.loginid !== activeLoginid;

    const hasValidationErrors = !bot.errorMessage && bot.validationErrors.length > 0;
    const status = bot.errorMessage
        ? 'Not ready — see the problems below'
        : hasValidationErrors
          ? 'Validation failed — see the problems below'
          : isRunning
            ? 'Running — confirmed by the execution engine'
            : validated
              ? 'Validated — press Start bot to trade'
              : 'Ready to validate';

    const statusTone = bot.errorMessage || hasValidationErrors ? 'error' : isRunning ? 'live' : validated ? 'ok' : 'idle';

    const handleStart = () => {
        if (liveAccount === 'Real' && !confirmingReal) {
            setConfirmingReal(true);
            return;
        }
        setConfirmingReal(false);
        startBot();
    };

    const startLabel = liveAccount === 'Real' ? 'Start bot on real account' : 'Start bot';
    const startTitle = !validated
        ? 'Validate the bot successfully before starting it'
        : isRunning
          ? 'This bot is already running'
          : liveAccount === 'Real'
            ? 'This opens a real-money session on your authorized account'
            : 'Start the bot — this places trades on the authorized Demo account';

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
                        {bot.strategyLabel} · {bot.contractType === 'both' ? 'Over / Under' : bot.contractType}
                        {bot.prediction !== null ? ` · prediction ${bot.prediction}` : ' · parity contract'}
                    </dd>
                </div>
                <div>
                    <dt>Account</dt>
                    <dd>
                        {liveAccount}
                        {activeLoginid ? ` · ${activeLoginid}` : ''}
                        {accountChanged && (
                            <span className='bot-banner__account-warning'>
                                {' '}
                                — changed since load ({bot.loginid}); validate again
                            </span>
                        )}
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

            {confirmingReal && !isRunning && (
                <div className='bot-banner__confirm' role='alertdialog' aria-label='Confirm real account start'>
                    <p className='bot-banner__confirm-text'>
                        <strong>Real account {activeLoginid || '—'}</strong> — starting this bot places real-money trades
                        with the loaded settings. Demo is the safe first test.
                    </p>
                    <div className='bot-banner__confirm-actions'>
                        <button
                            type='button'
                            className='free-bots-button free-bots-button--danger'
                            onClick={handleStart}
                        >
                            Confirm real-account start
                        </button>
                        <button type='button' className='free-bots-button' onClick={() => setConfirmingReal(false)}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            <div className='bot-banner__actions'>
                <button type='button' className='free-bots-button' onClick={validateBot}>
                    Validate bot
                </button>
                <button
                    type='button'
                    className='free-bots-button free-bots-button--primary'
                    onClick={handleStart}
                    disabled={!validated || isRunning || confirmingReal}
                    title={startTitle}
                >
                    {startLabel}
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
