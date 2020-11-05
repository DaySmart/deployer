'use strict'

class HardCoded {
	public stage: any;
	public input: any;

    constructor(config: any) {
        this.stage = config.env;
        this.input = config.input;
    }

    async deploy() {
        return {
            outputs: Object.entries(this.input).map(([key, value]) => {
                console.log(key, value);
                return {
                    key: key,
                    value: value
                }
            })
        }
    }
}

module.exports = HardCoded;