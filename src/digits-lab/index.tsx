/**
 * Deriv Digits Analysis Lab — Route entry point.
 *
 * Wraps the page with the DigitsLabProvider context.
 * This route bypasses the bot-builder initialization and runs
 * as a standalone public-data analysis tool.
 */

import React from 'react';
import { DigitsLabProvider } from './store';
import DigitsLabPage from './DigitsLabPage';

const DigitsLabRoute: React.FC = () => {
    return (
        <DigitsLabProvider>
            <DigitsLabPage />
        </DigitsLabProvider>
    );
};

export default DigitsLabRoute;
