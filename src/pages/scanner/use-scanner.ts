/**
 * React binding for the scanner store.
 *
 * Creates a single store instance and keeps its authorization state in sync with
 * the app's existing `useApiBase` observable stream (the same one the header
 * uses), so the scanner knows when a Deriv account is connected without owning
 * its own auth flow.
 */

import { useEffect, useRef } from 'react';
import { useApiBase } from '@/hooks/useApiBase';
import { ScannerStore } from './scanner-store';

let singleton: ScannerStore | null = null;

function getStore(): ScannerStore {
    if (!singleton) singleton = new ScannerStore();
    return singleton;
}

export function useScanner(): ScannerStore {
    const store = getStore();
    const { isAuthorized, activeLoginid } = useApiBase();
    const lastAuth = useRef<{ authorized: boolean; loginid: string | null } | null>(null);

    useEffect(() => {
        const current = { authorized: isAuthorized, loginid: activeLoginid || null };
        const prev = lastAuth.current;
        if (!prev || prev.authorized !== current.authorized || prev.loginid !== current.loginid) {
            lastAuth.current = current;
            store.setAuthState(current.authorized, current.loginid);
        }
    }, [isAuthorized, activeLoginid, store]);

    return store;
}

export { ScannerStore };
