import './digits_over_under';
import './digits_even_odd';
import './digits_matches_differs';
import './digits_high_run';
import './digits_shares_below';
import './digits_frequency';
import './digits_hot_cold';
import './digits_bar_neutral';
import './digits_streak';
// The cold-run pair reads: the losing pair in a row (0/1 or 8/9) and its red-bar guard.
import './digits_run_in_set';
import './digits_no_red_bar';
// The pair setup the Over 1 / Under 8 entries wait for: the last 2 digits are a pair from the losing
// digits, then a later tick confirms it — other digits may pass in between — and the whole entry
// condition (pair confirmed, both digits cold, no red bar) as one Boolean gate.
import './digits_pair_confirmation';
import './digits_cold_pair_entry';
import './switch_active_market';
// The parity-aware scan: it measures every eligible market's own latest ticks and keeps the best one
// for an Even/Odd entry, instead of stopping at the first market whose condition happens to pass.
import './switch_best_parity_market';
// The two-leg entry: Over 1 / Under 8 first, then the best even/odd entry after a loss.
import './digits_parity_recovery';
// The observed cold-run setup: the losing pair stays under a share with no red bar, then a settled
// loss reverses on the same market.
import './digits_cold_run_recovery';
// The Even/Odd strategy blocks: one rolling window, the conditions read from it and the two entries.
// They generate `Bot.eo*` calls, so this import is what makes them exist for the palette at all.
import './eo_configure';
import './eo_monitor_ticks';
import './eo_window_ready';
import './eo_even_percentage';
import './eo_odd_percentage';
import './eo_even_meets';
import './eo_odd_meets';
import './eo_signal_direction';
import './eo_buy_even';
import './eo_buy_odd';
import './eo_one_entry_per_signal';
import './eo_wait_tick';
// One reversal entry: journals the newest digits and buys the opposite parity in a single block.
import './eo_journal_reverse';
