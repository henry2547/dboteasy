import type { AiBotDefinition } from '../catalog';

interface AiBotCardProps {
    bot: AiBotDefinition;
    onOpen: (id: AiBotDefinition['id']) => void;
}

/** One bot in the AI Bots library; tapping it opens that bot's scanner setup. */
function AiBotCard({ bot, onOpen }: AiBotCardProps) {
    return (
        <button type='button' className='ai-bot-card' onClick={() => onOpen(bot.id)} aria-label={`Open ${bot.name}`}>
            <span className='ai-bot-card__top'>
                <span className='ai-bot-card__name'>{bot.name}</span>
                <span className={`ai-bot-card__badge ai-bot-card__badge--${bot.id}`}>AI</span>
            </span>
            <span className='ai-bot-card__tagline'>{bot.tagline}</span>
            <span className='ai-bot-card__rule'>{bot.summary}</span>
            <span className='ai-bot-card__cta'>Open scanner →</span>
        </button>
    );
}

export default AiBotCard;
