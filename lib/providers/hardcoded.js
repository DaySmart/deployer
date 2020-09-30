'use strict'
const constantCase = require('constant-case');


class HardCoded {
    constructor(config) {
        this.stage = config.env;
        this.input = config.input;
    }

    async deploy() {
        return {
            outputs: Object.entries(this.input).map(([key, value]) => {
                console.log(key, value);
                return {
                    key: constantCase.constantCase(key),
                    value: value
                }
            })
        }
    }
}

module.exports = HardCoded;