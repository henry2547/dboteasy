import { WHATS_NEW_ENTRIES, WHATS_NEW_RELEASE } from './whats-new-data';
import './info-submenu.scss';

/**
 * The "What's New" row in the hamburger drawer: the latest shipped changes, newest first. The copy
 * lives in `whats-new-data.ts` so a release note is a data edit, not a layout change.
 */
export default function WhatsNewSubmenu() {
    return (
        <div className='info-submenu'>
            <p className='info-submenu__intro'>What changed in this release of the app.</p>
            <span className='info-submenu__release'>Version {WHATS_NEW_RELEASE}</span>

            <ul className='info-submenu__list'>
                {WHATS_NEW_ENTRIES.map(entry => (
                    <li className='info-submenu__card' key={entry.title}>
                        <h3 className='info-submenu__title'>{entry.title}</h3>
                        <p className='info-submenu__body'>{entry.body}</p>
                    </li>
                ))}
            </ul>
        </div>
    );
}
