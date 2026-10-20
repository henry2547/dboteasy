/**
 * Types of the Virtual Hook runtime.
 *
 * A virtual hook is a named, event-driven listener registered from the Blockly canvas:
 * a `vhook_register` block defines the hook, a `vhook_listener` hat holds the statement
 * chain that runs when the hook fires, and the runtime dispatches genuine Deriv ticks (and
 * explicit manual/contract events) to the matching hooks.
 */

export type VirtualHookEventType =
    | 'tick'
    | 'digit_pattern'
    | 'analysis_condition'
    | 'contract_purchased'
    | 'contract_settled'
    | 'manual';

export const VIRTUAL_HOOK_EVENTS: { value: VirtualHookEventType; label: string }[] = [
    { value: 'tick', label: 'New tick' },
    { value: 'digit_pattern', label: 'Digit pattern detected' },
    { value: 'analysis_condition', label: 'Analysis condition met' },
    { value: 'contract_purchased', label: 'Contract purchased' },
    { value: 'contract_settled', label: 'Contract settled' },
    { value: 'manual', label: 'Manual trigger' },
];

export type VirtualHookConditionType =
    | 'last_digit_equals'
    | 'last_digit_in_set'
    | 'consecutive_match'
    | 'confirm_sequence'
    | 'frequency_above'
    | 'frequency_below'
    | 'losing_set_below'
    | 'min_valid_ticks'
    | 'feed_valid';

export const VIRTUAL_HOOK_CONDITIONS: { value: VirtualHookConditionType; label: string }[] = [
    { value: 'last_digit_equals', label: 'last digit equals' },
    { value: 'last_digit_in_set', label: 'last digit in set' },
    { value: 'consecutive_match', label: 'consecutive digits match' },
    { value: 'confirm_sequence', label: 'confirmation sequence' },
    { value: 'frequency_above', label: 'digit frequency above' },
    { value: 'frequency_below', label: 'digit frequency below' },
    { value: 'losing_set_below', label: 'combined digit share below' },
    { value: 'min_valid_ticks', label: 'valid ticks received at least' },
    { value: 'feed_valid', label: 'market and feed valid' },
];

/** Conditions that raise a `digit_pattern` event when they pass. */
export const PATTERN_CONDITIONS = new Set<VirtualHookConditionType>(['consecutive_match', 'confirm_sequence']);

export type VirtualHookConcurrency = 'sequential' | 'skip' | 'queue';

export interface VirtualHookConditionConfig {
    type: VirtualHookConditionType;
    /** Single digit for equals/frequency conditions. */
    digit?: number;
    /** Digit set for `last_digit_in_set` / `losing_set_below`. */
    digits?: number[];
    /** How many consecutive digits must match. */
    count?: number;
    /** Exact confirmation sequence, oldest first. */
    sequence?: number[];
    /** Percentage threshold. */
    threshold?: number;
    /** Rolling window the frequency is measured over. */
    sample?: number;
}

export interface VirtualHookDefinition {
    /** Blockly block id of the `vhook_register` block. */
    id: string;
    name: string;
    event: VirtualHookEventType;
    /** Symbol the hook listens on; empty means the market the bot runs on. */
    market: string;
    enabled: boolean;
    priority: number;
    concurrency: VirtualHookConcurrency;
    /** Optional condition on the register block. */
    condition: VirtualHookConditionConfig | null;
}

export interface VirtualHookListener {
    /** Blockly block id of the `vhook_listener` block. */
    id: string;
    hook: string;
    /** First block of the attached statement chain, or null when nothing is attached. */
    body: string | null;
    /** Registration order on the canvas. */
    order: number;
}

/** A canvas block flattened into plain data so the runtime never needs Blockly to execute it. */
export interface HookBlockNode {
    id: string;
    type: string;
    fields: Record<string, string>;
    inputs: Record<string, string | null>;
    next: string | null;
}

export interface VirtualHookProgram {
    definitions: VirtualHookDefinition[];
    listeners: VirtualHookListener[];
    blocks: Map<string, HookBlockNode>;
    errors: string[];
    warnings: string[];
    /** True when the canvas carries at least one virtual hook block. */
    has_hook_blocks: boolean;
}

export interface VirtualHookDataContext {
    symbol: string;
    digits: number[];
    lastDigit: number | null;
    quote: number | null;
    epoch: number | null;
    validTicks: number;
    now: number;
}

export interface VirtualHookConditionResult {
    passed: boolean;
    reason: string;
    /** Digits that formed the detected pattern, oldest first. */
    pattern: number[] | null;
}

export interface VirtualHookEvent {
    id: string;
    type: VirtualHookEventType;
    symbol: string;
    epoch: number | null;
    quote: number | null;
    digit: number | null;
    at: number;
    pattern: number[] | null;
    reason: string;
    /** Explicit data handed to a manual trigger. */
    data?: string;
}

export interface VirtualHookTraceStep {
    at: number;
    label: string;
    detail: string;
    status: 'ok' | 'blocked' | 'error';
}

export interface VirtualHookExecution {
    id: string;
    hook: string;
    hookId: string;
    event: VirtualHookEvent;
    /** Execution id this one was triggered from, when a hook triggered another. */
    parentId: string | null;
    depth: number;
    startedAt: number;
    finishedAt: number | null;
    durationMs: number | null;
    state: 'running' | 'completed' | 'cancelled' | 'error';
    steps: VirtualHookTraceStep[];
    result: string;
    error: string | null;
}

export interface VirtualHookRuntimeState {
    definition: VirtualHookDefinition;
    enabled: boolean;
    state: 'idle' | 'running' | 'queued' | 'disabled' | 'error';
    listenerCount: number;
    triggerCount: number;
    skippedCount: number;
    droppedCount: number;
    queueDepth: number;
    lastEventAt: number | null;
    lastEventType: string | null;
    lastReason: string | null;
    lastResult: string | null;
    lastError: string | null;
    lastExecutionId: string | null;
}

export interface VirtualHookFeedState {
    healthy: boolean;
    reason: string;
    symbol: string;
    lastTickAt: number | null;
    ageMs: number | null;
    validTicks: number;
    lastDigit: number | null;
    quote: number | null;
}

export interface VirtualHookSnapshot {
    active: boolean;
    startedAt: number | null;
    feed: VirtualHookFeedState;
    hooks: VirtualHookRuntimeState[];
    listeners: { hook: string; blockId: string; order: number; blocks: number }[];
    executions: VirtualHookExecution[];
    errors: { at: number; hook: string | null; message: string }[];
    metrics: {
        ticksReceived: number;
        eventsDispatched: number;
        executionsCompleted: number;
        executionsBlocked: number;
        activeExecutions: number;
    };
}
