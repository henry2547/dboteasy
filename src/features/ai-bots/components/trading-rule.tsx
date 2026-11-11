import type { AiBotId } from '../types';

interface TradingRuleProps {
    botId: AiBotId;
    ticks: number;
}

/**
 * The bot's rule in plain language, in the same shape as the reference panels:
 * a condition pill, the side it trades, and what happens otherwise.
 */
function TradingRule({ botId, ticks }: TradingRuleProps) {
    return (
        <div className='ai-rule'>
            <span className='ai-rule__label'>Trading rule</span>

            {botId === 'even_odd' ? (
                <>
                    <p className='ai-rule__line'>
                        If the hot and cold digits are both <span className='ai-rule__pill ai-rule__pill--up'>Even</span>{' '}
                        then trade <span className='ai-rule__pill ai-rule__pill--up'>Even</span>.
                    </p>
                    <p className='ai-rule__line'>
                        Else, if the hot and cold digits are both{' '}
                        <span className='ai-rule__pill ai-rule__pill--down'>Odd</span> then trade{' '}
                        <span className='ai-rule__pill ai-rule__pill--down'>Odd</span>.
                    </p>
                    <p className='ai-rule__line ai-rule__line--muted'>
                        Either way, the bot activates only when the last digit is the hot or the cold digit.
                    </p>
                </>
            ) : (
                <>
                    <p className='ai-rule__line'>
                        If the last <span className='ai-rule__pill ai-rule__pill--window'>{ticks}</span> ticks are
                        continuously rising, then trade <span className='ai-rule__pill ai-rule__pill--down'>Fall</span>.
                    </p>
                    <p className='ai-rule__line'>
                        Else, if they are continuously falling, then trade{' '}
                        <span className='ai-rule__pill ai-rule__pill--up'>Rise</span>.
                    </p>
                </>
            )}

            <p className='ai-rule__hint'>Otherwise, continue scanning until either condition is confirmed.</p>
        </div>
    );
}

export default TradingRule;
