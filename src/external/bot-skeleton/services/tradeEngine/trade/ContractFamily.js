/**
 * Cross-family entries: one bot trading an Over/Under leg and an Even/Odd leg in the same session.
 *
 * Every buy — the plain `Purchase` block, the Even/Odd runtime and the parity-recovery block — goes
 * through `purchase`, and `purchase` asks this mixin for the trade options that contract really
 * needs. That keeps the switch in one place: the barrier only travels with a family that reads one,
 * the trade definition still decides which contracts may be bought, and the family a confirmed buy
 * used is remembered so a real switch can be journalled.
 */
import { notify } from '../utils/broadcast';
import {
    canTradeContract,
    contractTradeOptions,
    describeContractFamily,
    familiesOfContractTypes,
    familyOfContractType,
    readWorkspaceTradeDefinition,
} from '../utils/contract-families';

export default Engine =>
    class ContractFamily extends Engine {
        constructor() {
            super();
            /** The family the last confirmed buy used; `null` before the first one. */
            this.contract_family = null;
        }

        /** The last family bought, or the one the trade definition names before the first buy. */
        getContractFamily() {
            if (this.contract_family) return this.contract_family;
            return familiesOfContractTypes(this.options?.contractTypes)[0] ?? null;
        }

        contractFamilyOf(contract_type) {
            return familyOfContractType(contract_type);
        }

        /** True when the trade definition holds this contract, or lists `both`. */
        canBuyContract(contract_type) {
            return canTradeContract(readWorkspaceTradeDefinition(), contract_type).ok;
        }

        /**
         * The trade options and family one buy really uses, or the reason it cannot be placed.
         * Read by `purchase` for every entry, so all entry paths share the same switch.
         */
        resolveContractTradeOptions(contract_type, options = {}) {
            // Only digit contracts switch families. Every other contract (CALL, TICKLOW, MULTUP, …)
            // keeps the trade options the definition gave it, exactly as before.
            if (!familyOfContractType(contract_type)) {
                return { ok: true, family: null, tradeOptions: this.tradeOptions };
            }

            const permitted = canTradeContract(readWorkspaceTradeDefinition(), contract_type);
            if (!permitted.ok) {
                return { ok: false, family: permitted.family, tradeOptions: this.tradeOptions, error: permitted.reason };
            }

            return contractTradeOptions(this.tradeOptions, contract_type, options);
        }

        /** Remembers the family a confirmed buy used and journals a real switch. */
        recordContractFamily(family) {
            if (!family) return;
            const previous = this.getContractFamily();
            this.contract_family = family;
            if (previous && previous !== family) {
                notify('info', `Contract family switched: ${describeContractFamily(previous)} → ${describeContractFamily(family)}.`);
            }
        }
    };
