import { localize } from '@deriv-com/translations';
import { notify } from './broadcast';

/**
 * The SweetAlert popup behind the Blocks menu's "Sweet alert" block (Utility).
 *
 * It is loaded on demand so the engine never imports UI at module load. The engine raises the same
 * popup itself when a bot stops on its own (three failed entry checks in a row), so a stop the
 * program decided looks exactly like the one the block shows.
 */
export const showSweetAlert = ({ icon = 'info', title = '', message = '' } = {}) => {
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
};
