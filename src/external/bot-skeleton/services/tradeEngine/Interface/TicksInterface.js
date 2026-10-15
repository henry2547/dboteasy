const getTicksInterface = tradeEngine => {
    return {
        getDelayTickValue: (...args) => tradeEngine.getDelayTickValue(...args),
        getCurrentStat: (...args) => tradeEngine.getCurrentStat(...args),
        getStatList: (...args) => tradeEngine.getStatList(...args),
        getLastTick: (...args) => tradeEngine.getLastTick(...args),
        getLastDigit: (...args) => tradeEngine.getLastDigit(...args),
        isLastDigitOver: (...args) => tradeEngine.isLastDigitOver(...args),
        isLastDigitUnder: (...args) => tradeEngine.isLastDigitUnder(...args),
        isLastDigitParity: (...args) => tradeEngine.isLastDigitParity(...args),
        isLastDigitMatches: (...args) => tradeEngine.isLastDigitMatches(...args),
        isLastDigitDiffers: (...args) => tradeEngine.isLastDigitDiffers(...args),
        getDigitFrequency: (...args) => tradeEngine.getDigitFrequency(...args),
        getTicks: (...args) => tradeEngine.getTicks(...args),
        checkDirection: (...args) => tradeEngine.checkDirection(...args),
        getOhlcFromEnd: (...args) => tradeEngine.getOhlcFromEnd(...args),
        getOhlc: (...args) => tradeEngine.getOhlc(...args),
        getLastDigitList: (...args) => tradeEngine.getLastDigitList(...args),
    };
};

export default getTicksInterface;
