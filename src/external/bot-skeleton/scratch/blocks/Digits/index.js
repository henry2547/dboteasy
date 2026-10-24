import './digits_over_under';
import './digits_even_odd';
import './digits_matches_differs';
import './digits_high_run';
import './digits_shares_below';
import './digits_frequency';
import './digits_hot_cold';
import './digits_bar_neutral';
import './digits_streak';
import './switch_active_market';
// The parity-aware scan: it measures every eligible market's own latest ticks and keeps the best one
// for an Even/Odd entry, instead of stopping at the first market whose condition happens to pass.
import './switch_best_parity_market';
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
