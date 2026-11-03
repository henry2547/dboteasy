import { LegacyEmailIcon, LegacyOpenLink1pxIcon, LegacyWhatsappIcon } from '@deriv/quill-icons/Legacy';
import './info-submenu.scss';

/** Where to reach the person behind the app. Edit these three values to change the contact card. */
const GITHUB_URL = 'https://github.com/henry2547';
const EMAIL = 'henrynjue255@gmail.com';
const WHATSAPP_NUMBER = '+254742735159';
const WHATSAPP_URL = 'https://wa.me/254742735159';

type TContactLink = {
    label: string;
    value: string;
    href: string;
    Icon: React.ElementType;
};

const CONTACTS: TContactLink[] = [
    {
        label: 'GitHub',
        value: 'github.com/henry2547',
        href: GITHUB_URL,
        Icon: LegacyOpenLink1pxIcon,
    },
    {
        label: 'Email',
        value: EMAIL,
        href: `mailto:${EMAIL}`,
        Icon: LegacyEmailIcon,
    },
    {
        label: 'WhatsApp',
        value: WHATSAPP_NUMBER,
        href: WHATSAPP_URL,
        Icon: LegacyWhatsappIcon,
    },
];

/**
 * The "Contact us" row in the hamburger drawer. Each row is a real link (opens in a new tab on
 * desktop, hands off to the mail or WhatsApp app on a phone).
 */
export default function ContactUsSubmenu() {
    return (
        <div className='info-submenu'>
            <p className='info-submenu__intro'>Questions, bugs or a bot idea — reach me on any of these.</p>

            <ul className='info-submenu__list'>
                {CONTACTS.map(({ label, value, href, Icon }) => (
                    <li key={label}>
                        <a
                            className='info-submenu__link'
                            href={href}
                            target='_blank'
                            rel='noreferrer'
                            aria-label={`${label}: ${value}`}
                        >
                            <span className='info-submenu__icon'>
                                <Icon iconSize='sm' />
                            </span>
                            <span className='info-submenu__text'>
                                <span className='info-submenu__label'>{label}</span>
                                <span className='info-submenu__value'>{value}</span>
                            </span>
                            <span className='info-submenu__arrow' aria-hidden='true'>
                                →
                            </span>
                        </a>
                    </li>
                ))}
            </ul>

            <p className='info-submenu__note'>
                Tap the GitHub link to see more contact information on my profile.
            </p>
        </div>
    );
}
