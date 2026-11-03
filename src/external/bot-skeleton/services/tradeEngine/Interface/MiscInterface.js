import { localize } from '@deriv-com/translations';
import { observer as globalObserver } from '../../../utils/observer';
import { notify } from '../utils/broadcast';

const getMiscInterface = tradeEngine => {
    return {
        notify: args => globalObserver.emit('ui.log.notify', args),
        // A SweetAlert popup the program opens itself — the block builder's way to announce a take
        // profit or a stop loss. Loaded on demand so the engine never imports UI at module load.
        sweetAlert: ({ icon = 'info', title = '', message = '' } = {}) => {
            import('sweetalert2')
                .then(({ default: Swal }) =>
                    Swal.fire({
                        icon,
                        title: String(title ?? ''),
                        text: String(message ?? ''),
                        confirmButtonText: localize('Okay'),
                    })
                )
                .catch(() => notify('warn', localize('The sweet alert could not be shown')));
        },
        console: ({ type, message }) => console[type](message), // eslint-disable-line no-console
        notifyTelegram: (access_token, chat_id, text) => {
            const url = `https://api.telegram.org/bot${access_token}/sendMessage`;
            const onError = () => notify('warn', localize('The Telegram notification could not be sent'));

            fetch(url, {
                method: 'POST',
                mode: 'cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id, text }),
            })
                .then(response => {
                    if (!response.ok) {
                        onError();
                    }
                })
                .catch(onError);
        },
        getTotalRuns: () => tradeEngine.getTotalRuns(),
        getBalance: type => tradeEngine.getBalance(type),
        getTotalProfit: toString => tradeEngine.getTotalProfit(toString, tradeEngine.tradeOptions.currency),
    };
};

export default getMiscInterface;
