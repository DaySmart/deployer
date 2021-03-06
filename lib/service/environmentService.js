"use strict";
const got = require('got');
const apiUrl = "https://environments.daysmart.net/output";
module.exports = {
    async putComponentOutput(environment, component, key, value) {
        await got.post(apiUrl, {
            json: {
                componentName: `${environment}.${component}`,
                outputName: key,
                value: value
            }
        });
    }
};
