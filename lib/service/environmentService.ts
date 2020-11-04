const got = require('got');

const apiUrl = "https://environments.daysmart.net/output"

module.exports = {
    async putComponentOutput(environment: string, component: string, key: string, value: string) {
        await got.post(apiUrl, {
            json: {
                componentName: `${environment}.${component}`,
                outputName: key,
                value: value
            }
        });
    }
}

