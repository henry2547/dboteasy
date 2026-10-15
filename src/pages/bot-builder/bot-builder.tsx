// @ts-nocheck — vendored bot code with known upstream type gaps; see AGENTS.md
import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { botNotification } from '@/components/bot-notification/bot-notification';
import { notification_message } from '@/components/bot-notification/bot-notification-utils';
import { useStore } from '@/hooks/useStore';
import { localize } from '@deriv-com/translations';
import { useDevice } from '@deriv-com/ui';
import { TBlocklyEvents } from 'Types';
import LoadModal from '../../components/load-modal';
import {
    clearPendingSelection,
    hasPendingSelection,
    onSelectionPending,
    readSavedSelection,
} from '../bot/bot-selection-store';
import { applySelectionToWorkspace, buildWorkspaceXml, workspaceHolds } from '../bot/bot-workspace';
import SaveModal from '../dashboard/bot-list/save-modal';
import BotBuilderTourHandler from '../tutorials/dbot-tours/bot-builder-tour';
import QuickStrategy1 from './quick-strategy';
import WorkspaceWrapper from './workspace-wrapper';

const BotBuilder = observer(() => {
    const { dashboard, app, run_panel, toolbar, quick_strategy, blockly_store } = useStore();
    const { active_tab, active_tour, is_preview_on_popup } = dashboard;
    const { is_open } = quick_strategy;
    const { is_running } = run_panel;
    const { is_loading } = blockly_store;
    const is_blockly_listener_registered = React.useRef(false);
    const is_blockly_delete_listener_registered = React.useRef(false);
    const { isDesktop } = useDevice();
    const { onMount, onUnmount } = app;
    const el_ref = React.useRef<HTMLInputElement | null>(null);

    // TODO: fix
    // const isMounted = useIsMounted();
    // const { data: remote_config_data } = useRemoteConfig(isMounted());
    let deleted_block_id: null | string = null;

    React.useEffect(() => {
        onMount();
        return () => onUnmount();
    }, [onMount, onUnmount]);

    React.useEffect(() => {
        const workspace = window.Blockly?.derivWorkspace;
        if (workspace && is_running && !is_blockly_listener_registered.current) {
            is_blockly_listener_registered.current = true;
            workspace.addChangeListener(handleBlockChangeOnBotRun);
        } else {
            removeBlockChangeListener();
        }

        return () => {
            if (workspace && is_blockly_listener_registered.current) {
                removeBlockChangeListener();
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [is_running]);

    const handleBlockChangeOnBotRun = (e: Event) => {
        const { is_reset_button_clicked } = toolbar;
        if (e.type !== 'selected' && !is_reset_button_clicked) {
            botNotification(notification_message().workspace_change);
            removeBlockChangeListener();
        } else if (is_reset_button_clicked) {
            removeBlockChangeListener();
        }
    };

    const removeBlockChangeListener = () => {
        is_blockly_listener_registered.current = false;
        window.Blockly?.derivWorkspace?.removeChangeListener(handleBlockChangeOnBotRun);
    };
    React.useEffect(() => {
        const workspace = window.Blockly?.derivWorkspace;
        if (workspace && !is_blockly_delete_listener_registered.current) {
            is_blockly_delete_listener_registered.current = true;
            workspace.addChangeListener(handleBlockDelete);
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [is_loading]);

    const handleBlockDelete = (e: TBlocklyEvents) => {
        const { is_reset_button_clicked, setResetButtonState } = toolbar;
        if (e.type === 'undo') {
            deleted_block_id = null;
            return;
        }
        if (e.type === 'delete' && !is_reset_button_clicked) {
            deleted_block_id = e.blockId;
        }
        if (e.type === 'selected' && deleted_block_id === e.oldElementId) {
            handleBlockDeleteNotification();
            deleted_block_id = null;
        }
        if (
            e.type === 'change' &&
            e.name === 'AMOUNT_LIMITS' &&
            e.newValue === '(min: 0.35 - max: 50000)' &&
            is_reset_button_clicked
        ) {
            setResetButtonState(false);
        }
    };

    const handleBlockDeleteNotification = () => {
        botNotification(notification_message().block_delete, {
            label: localize('Undo'),
            onClick: closeToast => {
                window.Blockly.derivWorkspace.undo();
                closeToast?.();
            },
        });
    };

    // The Bot tab's menus hand their selection over here: this canvas loads those blocks so the tab
    // opens with the blocks the user selected. This canvas stays mounted for the app's whole life,
    // so the hand-off is driven by the Bot tab telling us — and runs on mount too, for a selection
    // left pending by a reload. The canvas and the app's own initial strategy are built
    // asynchronously, so the hand-off keeps trying and only records itself as done once the blocks
    // are really on the canvas.
    const [selection_request, setSelectionRequest] = React.useState(0);

    React.useEffect(() => onSelectionPending(() => setSelectionRequest(request => request + 1)), []);

    React.useEffect(() => {
        if (!hasPendingSelection()) return;

        let cancelled = false;
        let timer: ReturnType<typeof setTimeout>;
        let attempts = 0;
        const started_at = Date.now();

        const applySelection = async () => {
            if (cancelled) return;

            const has_canvas = Boolean(window.Blockly?.derivWorkspace);
            // Read the flag live: this effect is not re-created when it changes. Give up waiting on
            // it after a few seconds — a canvas that is on screen is settled enough to hand the
            // blocks to, even if the flag was left behind by a failure.
            const canvas_settled = has_canvas && (!blockly_store.is_loading || Date.now() - started_at > 3000);

            if (canvas_settled) {
                const xml = buildWorkspaceXml(readSavedSelection());
                if (!xml) {
                    clearPendingSelection();
                    return;
                }
                const loaded = await applySelectionToWorkspace(xml);
                if (loaded && !cancelled) {
                    // The app's own initial strategy can still land on top of this, so confirm the
                    // blocks are here to stay before treating the hand-off as done.
                    timer = setTimeout(() => {
                        if (cancelled) return;
                        if (workspaceHolds(loaded)) {
                            clearPendingSelection();
                        } else if (attempts++ < 40) {
                            applySelection();
                        }
                    }, 400);
                    return;
                }
            }

            if (attempts++ < 40) timer = setTimeout(applySelection, 250);
        };

        applySelection();
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selection_request]);

    return (
        <>
            <div
                className={classNames('bot-builder', {
                    'bot-builder--active': active_tab === 1 && !is_preview_on_popup,
                    'bot-builder--inactive': is_preview_on_popup,
                    'bot-builder--tour-active': active_tour,
                })}
            >
                <div id='scratch_div' ref={el_ref}>
                    <WorkspaceWrapper />
                </div>
            </div>
            {active_tab === 1 && <BotBuilderTourHandler is_mobile={!isDesktop} />}
            {/* removed this outside from toolbar becuase it needs to loaded seperately without dependency */}
            <LoadModal />
            <SaveModal />
            {is_open && <QuickStrategy1 />}
        </>
    );
});

export default BotBuilder;
