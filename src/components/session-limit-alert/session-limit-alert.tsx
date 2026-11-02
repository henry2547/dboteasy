import { observer } from 'mobx-react-lite';
import Button from '@/components/shared_ui/button';
import Modal from '@/components/shared_ui/modal';
import Text from '@/components/shared_ui/text';
import { useStore } from '@/hooks/useStore';
import { Localize, localize } from '@deriv-com/translations';
import './session-limit-alert.scss';

const money = (amount: number, currency: string) => `${Number(amount).toFixed(2)}${currency ? ` ${currency}` : ''}`;

/**
 * Centred notification for the take profit / stop loss the last run really reached.
 *
 * It reads the run panel's own record of the stop, so it never claims a limit the engine did not
 * reach. Okay goes back to the trades of that bot (the trade window's Transactions tab); the
 * secondary action starts the next run with the same bot, which is the app's normal Run path.
 */
const SessionLimitAlert = observer(() => {
    const { run_panel } = useStore();
    const alert = run_panel.session_limit_alert;

    if (!alert) return null;

    const is_take_profit = alert.kind === 'take_profit';
    const limit = `${is_take_profit ? '+' : '−'}${money(alert.amount, alert.currency)}`;

    return (
        <Modal
            className='session-limit-alert'
            is_open
            is_vertical_centered
            has_close_icon={false}
            should_close_on_click_outside={false}
            toggleModal={run_panel.dismissSessionLimitAlert}
        >
            <div className='session-limit-alert__body'>
                <span
                    className={`session-limit-alert__icon session-limit-alert__icon--${
                        is_take_profit ? 'profit' : 'loss'
                    }`}
                    aria-hidden='true'
                >
                    {is_take_profit ? (
                        <svg width='26' height='26' viewBox='0 0 26 26' fill='none'>
                            <path
                                d='M6 13.5l4.5 4.5L20 8'
                                stroke='currentColor'
                                strokeWidth='2.4'
                                strokeLinecap='round'
                                strokeLinejoin='round'
                            />
                        </svg>
                    ) : (
                        <svg width='26' height='26' viewBox='0 0 26 26' fill='none'>
                            <path
                                d='M13 7.5v6.5M13 18.2v.1'
                                stroke='currentColor'
                                strokeWidth='2.4'
                                strokeLinecap='round'
                            />
                        </svg>
                    )}
                </span>
                <Text as='h2' weight='bold' className='session-limit-alert__title'>
                    {is_take_profit ? (
                        <Localize i18n_default_text='Take profit reached' />
                    ) : (
                        <Localize i18n_default_text='Stop loss reached' />
                    )}
                </Text>
                <Text as='p' size='xs' className='session-limit-alert__message'>
                    {is_take_profit ? (
                        <Localize
                            i18n_default_text='{{ bot }} closed this run at {{ profit }}, past its {{ limit }} take profit.'
                            values={{ bot: alert.bot_name, profit: money(alert.profit, alert.currency), limit }}
                        />
                    ) : (
                        <Localize
                            i18n_default_text='{{ bot }} closed this run at {{ profit }}, past its {{ limit }} stop loss.'
                            values={{ bot: alert.bot_name, profit: money(alert.profit, alert.currency), limit }}
                        />
                    )}
                </Text>
                <div className='session-limit-alert__actions'>
                    <Button
                        id='db-session-limit-ok'
                        className='session-limit-alert__ok'
                        primary
                        large
                        text={localize('Okay')}
                        onClick={run_panel.showSessionLimitTrades}
                    />
                    <Button
                        id='db-session-limit-run-again'
                        className='session-limit-alert__again'
                        tertiary
                        text={localize('Run again')}
                        onClick={() => {
                            run_panel.dismissSessionLimitAlert();
                            run_panel.onRunButtonClick();
                        }}
                    />
                </div>
            </div>
        </Modal>
    );
});

export default SessionLimitAlert;
