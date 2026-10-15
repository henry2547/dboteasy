import { Component, type ErrorInfo, type ReactNode } from 'react';
import './error-boundary.scss';

interface ErrorBoundaryProps {
    children: ReactNode;
    /** Shown in the fallback so the user knows which area failed. */
    label?: string;
}

interface ErrorBoundaryState {
    hasError: boolean;
    message: string;
}

/**
 * Keeps a crash inside one view from taking the whole app down. Wrap a tab page
 * with it and a broken render shows a recoverable card instead of a blank app.
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = { hasError: false, message: '' };

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, message: error?.message || 'Something went wrong.' };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        // Keep the console useful without tearing down the shell.
        console.error(`[ErrorBoundary${this.props.label ? `:${this.props.label}` : ''}]`, error, info);
    }

    private reset = () => this.setState({ hasError: false, message: '' });

    private reload = () => {
        if (typeof window !== 'undefined') window.location.reload();
    };

    render() {
        if (!this.state.hasError) return this.props.children;

        return (
            <div className='error-boundary' role='alert'>
                <h3 className='error-boundary__title'>
                    {this.props.label ? `${this.props.label} hit a problem` : 'Something went wrong'}
                </h3>
                <p className='error-boundary__message'>{this.state.message}</p>
                <div className='error-boundary__actions'>
                    <button type='button' className='error-boundary__button' onClick={this.reset}>
                        Try again
                    </button>
                    <button
                        type='button'
                        className='error-boundary__button error-boundary__button--ghost'
                        onClick={this.reload}
                    >
                        Reload app
                    </button>
                </div>
            </div>
        );
    }
}
