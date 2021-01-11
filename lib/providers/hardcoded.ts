'use strict'

class HardCoded {
	public stage: any;
	public input: any;

    constructor(config: any) {
        this.stage = config.env;
        this.input = config.inputs;
    }

    async deploy() {
        return {
            outputs: Object.entries(this.input).map(([key, value]) => {
                console.log(key, value);
                return {
                    Key: key,
                    Value: value
                }
            })
        }
    }
}

module.exports = HardCoded;