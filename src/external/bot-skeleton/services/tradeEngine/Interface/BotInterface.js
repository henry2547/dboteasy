import { observer as globalObserver } from '../../../utils/observer';
import { observerRuntime } from '../../observer';
import { createDetails } from '../utils/helpers';

const getBotInterface = tradeEngine => {
    const getDetail = i => createDetails(tradeEngine.data.contract)[i];

    return {
        init: (...args) => tradeEngine.init(...args),
        start: (...args) => tradeEngine.start(...args),
        stop: (...args) => tradeEngine.stop(...args),
        // The optional `{ barrier }` lets a leg trade a contract family the trade definition does
        // not carry itself (Over 1 from an Even/Odd bot), so its own barrier travels with the buy.
        purchase: (contract_type, options) => tradeEngine.purchase(contract_type, options),
        getAskPrice: contract_type => Number(getProposal(contract_type, tradeEngine).ask_price),
        getPayout: contract_type => Number(getProposal(contract_type, tradeEngine).payout),
        getPurchaseReference: () => tradeEngine.getPurchaseReference(),
        isSellAvailable: () => tradeEngine.isSellAtMarketAvailable(),
        sellAtMarket: () => tradeEngine.sellAtMarket(),
        getSellPrice: () => getSellPrice(tradeEngine),
        isResult: result => getDetail(10) === result,
        isTradeAgain: result => globalObserver.emit('bot.trade_again', result),
        readDetails: i => getDetail(i - 1),
        // Observer entry gate: true once per signalled entry, so a canvas whose observer
        // program holds entry blocks trades only when those conditions pass.
        observerEntryPassed: () => observerRuntime.consumeEntry(),
        // Observer blocks reached by the generated program hand themselves back to the observer
        // runtime, which evaluates them against the genuine tick stream.
        observerValue: (id, fallback) => observerRuntime.valueOfBlock(id, fallback),
        observerCondition: id => observerRuntime.conditionOfBlock(id),
        observerStatement: id => observerRuntime.runStatement(id),
    };
};

const getProposal = (contract_type, tradeEngine) => {
    return tradeEngine.data.proposals.find(
        proposal =>
            proposal.contract_type === contract_type &&
            proposal.purchase_reference === tradeEngine.getPurchaseReference()
    );
};

const getSellPrice = tradeEngine => {
    return tradeEngine.getSellPrice();
};

export default getBotInterface;
