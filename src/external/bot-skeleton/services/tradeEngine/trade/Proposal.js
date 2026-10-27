import { getLocalizedErrorMessage } from '@/constants/backend-error-messages';
import { api_base } from '../../api/api-base';
import { doUntilDone, tradeOptionToProposal } from '../utils/helpers';
import { clearProposals, proposalsReady } from './state/actions';

export default Engine =>
    class Proposal extends Engine {
        makeProposals(trade_option, { force = false } = {}) {
            // `force` quotes a contract the trade definition does not carry (a cross-family entry)
            // even when every other trade option is unchanged.
            if (!force && !this.isNewTradeOption(trade_option)) {
                return;
            }

            // Generate a purchase reference when trade options are different from previous trade options.
            // This will ensure the bot doesn't mistakenly purchase the wrong proposal.
            this.regeneratePurchaseReference();
            this.trade_option = trade_option;
            this.proposal_templates = tradeOptionToProposal(trade_option, this.getPurchaseReference());
            this.renewProposalsOnPurchase();
        }

        selectProposal(contract_type) {
            const { proposals } = this.data;

            if (proposals.length === 0) {
                throw Error(getLocalizedErrorMessage('ProposalsNotReady'));
            }

            const to_buy = proposals.find(proposal => {
                if (
                    proposal.contract_type === contract_type &&
                    proposal.purchase_reference === this.getPurchaseReference()
                ) {
                    // Below happens when a user has had one of the proposals return
                    // with a ContractBuyValidationError. We allow the logic to continue
                    // to here cause the opposite proposal may still be valid. Only once
                    // they attempt to purchase the errored proposal we will intervene.
                    if (proposal.error) {
                        // Ensure we throw the localized error message
                        throw proposal.error;
                    }

                    return proposal;
                }

                return false;
            });

            if (!to_buy) {
                throw new Error(getLocalizedErrorMessage('SelectedProposalNotExist'));
            }

            return {
                id: to_buy.id,
                askPrice: to_buy.ask_price,
            };
        }

        /**
         * Makes sure a proposal for this contract type exists before a purchase selects it.
         *
         * A cross-family entry buys a contract the definition does not list (Over 1 from an Even/Odd
         * bot, or the other way round), so that contract is quoted with the barrier the entry asks
         * for and the purchase waits for its own proposal, exactly as `start` waits for the first.
         */
        ensureContractProposals(contract_type, trade_options = this.tradeOptions) {
            if (!this.is_proposal_subscription_required) return Promise.resolve();
            if (this.proposal_templates?.some(template => template.contract_type === contract_type)) {
                return Promise.resolve();
            }

            this.makeProposals({ ...this.options, ...trade_options, contractTypes: [contract_type] }, { force: true });

            return new Promise(resolve => {
                const has_proposal = () =>
                    this.store.getState().proposalsReady ||
                    this.data.proposals.some(proposal => proposal.contract_type === contract_type);
                if (has_proposal()) {
                    resolve();
                    return;
                }
                const unsubscribe = this.store.subscribe(() => {
                    if (has_proposal()) {
                        unsubscribe();
                        resolve();
                    }
                });
            });
        }

        renewProposalsOnPurchase() {
            this.data.proposals = [];
            this.store.dispatch(clearProposals());
            this.requestProposals();
        }

        requestProposals() {
            // Since there are two proposals (in most cases), an error may be logged twice, to avoid this
            // flip this boolean on error.
            let has_informed_error = false;

            Promise.all(
                this.proposal_templates.map(proposal => {
                    doUntilDone(() => api_base.api.send(proposal)).catch(error => {
                        // We intercept ContractBuyValidationError as user may have specified
                        // e.g. a DIGITUNDER 0 or DIGITOVER 9, while one proposal may be invalid
                        // the other is valid. We will error on Purchase rather than here.

                        if (error?.error?.code === 'ContractBuyValidationError') {
                            // Create localized error message for validation errors
                            const localizedError = new Error(getLocalizedErrorMessage(error.error.code, error.error));
                            localizedError.code = error.error.code;
                            localizedError.details = error.error.details;
                            localizedError.message_to_client = error.error.message_to_client;

                            this.data.proposals.push({
                                ...error.error.echo_req,
                                ...error.echo_req.passthrough,
                                error: localizedError,
                            });

                            return null;
                        }
                        if (!has_informed_error) {
                            has_informed_error = true;
                            // Use localized error message for general errors
                            const localizedErrorMessage = error.error.code
                                ? getLocalizedErrorMessage(error.error.code, error.error)
                                : error.error.message || getLocalizedErrorMessage('GeneralError');

                            const localizedError = {
                                ...error.error,
                                message: localizedErrorMessage,
                            };
                            this.$scope.observer.emit('Error', localizedError);
                        }
                        return null;
                    });
                })
            );
        }

        observeProposals() {
            if (!api_base.api) return;
            const subscription = api_base.api.onMessage().subscribe(response => {
                if (response.data.msg_type === 'proposal') {
                    const { passthrough, proposal, error } = response.data;

                    // Handle proposal errors with localized messages
                    if (error) {
                        const localizedError = new Error(getLocalizedErrorMessage(error.code, error));
                        localizedError.code = error.code;
                        localizedError.details = error.details;
                        localizedError.message_to_client = error.message_to_client;

                        this.data.proposals.push({
                            ...passthrough,
                            error: localizedError,
                        });
                        return;
                    }

                    if (proposal && this.data.proposals.findIndex(p => p.id === proposal.id) === -1) {
                        // Add proposals based on the ID returned by the API.
                        this.data.proposals.push({ ...proposal, ...passthrough });
                        this.checkProposalReady();
                    }
                }
            });
            api_base.pushSubscription(subscription);
        }

        checkProposalReady() {
            // Proposals are considered ready when the proposals in our memory match the ones
            // we've requested from the API, we determine this by checking the passthrough of the response.
            const { proposals } = this.data;

            if (proposals.length > 0 && this.proposal_templates) {
                const has_equal_proposals = this.proposal_templates.every(template => {
                    return (
                        proposals.findIndex(proposal => {
                            return (
                                proposal.purchase_reference === template.passthrough.purchase_reference &&
                                proposal.contract_type === template.contract_type
                            );
                        }) !== -1
                    );
                });

                if (has_equal_proposals) {
                    this.startPromise.then(() => this.store.dispatch(proposalsReady()));
                }
            }
        }

        isNewTradeOption(trade_option) {
            if (!this.trade_option) {
                this.trade_option = trade_option;
                return true;
            }

            // Compare incoming "trade_option" argument with "this.trade_option", if any
            // of the values is different, this is a new tradeOption and new proposals
            // should be generated.
            return [
                'amount',
                'barrierOffset',
                'basis',
                'duration',
                'duration_unit',
                'prediction',
                'secondBarrierOffset',
                'underlying_symbol',
            ].some(value => this.trade_option[value] !== trade_option[value]);
        }
    };
