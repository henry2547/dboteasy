import Text from '@/components/shared_ui/text';
import { TBotStatus } from '@/types';
import { localize } from '@deriv-com/translations';
import './bot-status-badge.scss';

const LABELS: Record<TBotStatus, string> = {
    running: localize('Running'),
    stopped: localize('Stopped'),
};

/** Shows whether a bot is trading right now. */
const BotStatusBadge = ({ status }: { status: TBotStatus }) => {
    const label = LABELS[status] ?? LABELS.stopped;

    return (
        <span
            className={`bot-status-badge bot-status-badge--${status}`}
            data-testid={`dt_bot_status_${status}`}
            title={label}
        >
            <span className='bot-status-badge__dot' />
            <Text as='p' size='xxs' lineHeight='l' className='bot-status-badge__text'>
                {label}
            </Text>
        </span>
    );
};

export default BotStatusBadge;
