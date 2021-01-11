'use strict';
class HardCoded {
    constructor(config) {
        this.stage = config.env;
        this.input = config.inputs;
    }
    async deploy() {
        return {
            result: true,
            outputs: Object.entries(this.input).map(([key, value]) => {
                console.log(key, value);
                return {
                    Key: key,
                    Value: value
                };
            })
        };
    }
}
module.exports = HardCoded;
