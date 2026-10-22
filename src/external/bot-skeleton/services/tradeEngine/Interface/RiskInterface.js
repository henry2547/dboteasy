/**
 * The risk-management surface the generated program talks to.
 *
 * Every entry is a synchronous read (or a state change) of numbers this session really recorded,
 * so a block can be used inside an ordinary condition without suspending the interpreter.
 */
const getRiskInterface = tradeEngine => ({
    riskCanTrade: () => tradeEngine.riskCanTrade(),
    riskBlockReason: () => tradeEngine.riskBlockReason(),
    riskConsecutiveLosses: () => tradeEngine.riskConsecutiveLosses(),
    riskGiveBack: () => tradeEngine.riskGiveBack(),
    riskExposure: () => tradeEngine.riskExposure(),
    riskStake: percent => tradeEngine.riskStake(percent),
    riskSetLimits: limits => tradeEngine.setRiskLimits(limits),
    riskResetSession: () => tradeEngine.resetRiskSession(),
    riskReport: () => tradeEngine.riskReport(),
});

export default getRiskInterface;
