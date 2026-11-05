import Text from '@/components/shared_ui/text';
import { formatBotConfig } from '@/services/bots.service';
import { TBotConfig } from '@/types';
import './bot-config-summary.scss';

/** The trade setup a bot is configured with, as one short line under its name. */
const BotConfigSummary = ({ config }: { config?: TBotConfig }) => {
    const summary = config ? formatBotConfig(config) : '';

    if (!summary) return null;

    return (
        <Text as='p' size='xxs' lineHeight='s' className='bot-config-summary' title={summary}>
            {summary}
        </Text>
    );
};

export default BotConfigSummary;
