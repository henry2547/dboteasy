import './splash-screen.scss';

/**
 * Brand splash shown while the app boots. Renders the partner logo
 * (public/logo.png), the same mark used by the header and the favicon,
 * as a full-screen overlay.
 */
export default function SplashScreen({ message }: { message?: string }) {
    return (
        <div className='app-splash'>
            <img className='app-splash__logo' src='/logo.png' alt='' />
            <span className='app-splash__spinner' aria-hidden='true' />
            {message && <p className='app-splash__message'>{message}</p>}
        </div>
    );
}
