/**
 * Connection status indicator panel
 */

import React from 'react';
import { useDigitsLab } from '../store';

const statusConfig: Record<string, { label: string; color: string; icon: string }> = {
    idle: { label: 'Idle', color: '#888', icon: '○' },
    connecting: { label: 'Connecting…', color: '#f0ad4e', icon: '◐' },
    connected: { label: 'Connected', color: '#28a745', icon: '●' },
    reconnecting: { label: 'Reconnecting…', color: '#f0ad4e', icon: '◐' },
    disconnected: { label: 'Disconnected', color: '#dc3545', icon: '○' },
    error: { label: 'Error', color: '#dc3545', icon: '✕' },
};

const ConnectionPanel: React.FC = () => {
    const { connection } = useDigitsLab();
    const cfg = statusConfig[connection.status] ?? statusConfig.idle;

    return (
        <div className="dl-connection" title={connection.errorMessage ?? cfg.label}>
            <span className="dl-connection__dot" style={{ color: cfg.color }}>
                {cfg.icon}
            </span>
            <span className="dl-connection__label">{cfg.label}</span>
            {connection.latencyMs != null && connection.status === 'connected' && (
                <span className="dl-connection__latency">{connection.latencyMs}ms</span>
            )}
        </div>
    );
};

export default ConnectionPanel;
