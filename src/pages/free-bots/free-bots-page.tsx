import { observer } from 'mobx-react-lite';
import { useApiBase } from '@/hooks/useApiBase';
import { useDigitsLabContext } from '@/pages/digits/digits-lab-context';
import MarketSelector from '@/pages/digits/components/market-selector';
import BotStatusBanner from './components/bot-status-banner';
import FreeBotCard from './components/free-bot-card';
import { supportsDigitContracts } from './market-support';
import { FREE_BOT_TEMPLATES, type FreeBotTemplate } from './templates';
import { useFreeBotLoader } from './use-free-bot-loader';
import './free-bots.scss';

/**
 * Free Bots library — the two digit-contract templates that ship with the app.
 *
 * The market list is the Digits lab's own live Deriv market discovery (one
 * shared feed, no second WebSocket), so the market picked here is the market
 * the rest of the app is already reading.
 */
const FreeBotsPage = observer(() => {
    const lab = useDigitsLabContext();
    const loader = useFreeBotLoader();
    const { activeLoginid } = useApiBase();

    const selectedMarket = lab.selectedMarket;
    const support = supportsDigitContracts(selectedMarket);
    const feedDown = lab.connection.status !== 'connected';
    const accountLabel = activeLoginid ? (activeLoginid.startsWith('VR') ? 'Demo' : 'Real') : 'Not signed in';

    const handleLoad = (template: FreeBotTemplate) => {
        if (!selectedMarket) return;
        void loader.loadBot({
            template,
            market: {
                symbol: selectedMarket.apiSymbol,
                displayName: selectedMarket.displayName,
                market: selectedMarket.market ?? null,
                submarket: selectedMarket.submarket ?? null,
            },
            marketSource: 'library',
            marketSupported: support.supported,
            marketSupportReason: support.reason,
        });
    };

    return (
        <div className='free-bots'>
            <header className='free-bots__hero'>
                <div>
                    <h2 className='free-bots__title'>Free Bots</h2>
                    <p className='free-bots__subtitle'>
                        Digit Over/Under bots built from the uploaded strategy files, loaded straight into the Bot Builder
                    </p>
                </div>
                <div className='free-bots__chips'>
                    <span className={`free-bots__chip free-bots__chip--${lab.connection.status}`}>
                        Feed: {lab.connection.status}
                    </span>
                    <span className='free-bots__chip'>{accountLabel}</span>
                </div>
            </header>

            {feedDown && (
                <p className='free-bots__warning'>
                    The Deriv market feed is {lab.connection.status}. Markets and prices below may be stale — a bot
                    cannot be validated until the feed is connected.
                </p>
            )}

            <BotStatusBanner variant='panel' />

            <section className='free-bots__market'>
                <h3 className='free-bots__section-title'>1. Choose the volatility market</h3>
                <MarketSelector
                    markets={lab.markets}
                    selectedMarket={selectedMarket}
                    onSelect={lab.selectMarket}
                    disabled={lab.connection.status !== 'connected'}
                />
                <p className={`free-bots__support free-bots__support--${support.supported ? 'ok' : 'blocked'}`}>
                    {support.reason}
                </p>
                {lab.markets.length === 0 && (
                    <p className='free-bots__empty'>
                        No markets discovered yet — the lab is still loading Deriv&apos;s market list.
                    </p>
                )}
            </section>

            <section className='free-bots__library'>
                <h3 className='free-bots__section-title'>2. Load a bot</h3>
                <div className='free-bots__grid'>
                    {FREE_BOT_TEMPLATES.map(template => (
                        <FreeBotCard
                            key={template.id}
                            template={template}
                            market={selectedMarket}
                            support={support}
                            loading={loader.loading && loader.bot?.templateId === template.id}
                            isRunning={loader.isRunning}
                            errorMessage={
                                loader.bot?.templateId === template.id ? loader.bot?.errorMessage ?? null : null
                            }
                            onLoad={() => handleLoad(template)}
                        />
                    ))}
                </div>
            </section>

            <p className='free-bots__disclaimer'>
                Loading never places a trade and the library is not advice: the scanner&apos;s digit percentages describe
                the ticks already seen, not the next one. Test on a Demo account first.
            </p>
        </div>
    );
});

export default FreeBotsPage;
