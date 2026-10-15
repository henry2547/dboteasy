import './bots-page.scss';
/** Isolate stock Blockly from the legacy builder's global prototype patches. */
export default function BotsPage(_props: { onOpenBuilder?: () => void }) {
    const prefix = window.location.pathname.includes('/bot/preview') ? '/bot/preview/' : '/';
    return <iframe className='observer-frame' title='Observational bot builder' src={prefix+'bot-lab.html'}/>;
}
