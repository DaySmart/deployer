'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const AWS = require("aws-sdk");
const lambda = new AWS.Lambda({ region: 'us-east-1' });
const logs = new AWS.CloudWatchLogs({ region: 'us-east-1' });
const codebuild = new AWS.CodeBuild({ region: 'us-east-1' });
class DsicollectionDynamicEnvironment {
    constructor(config) {
        this.stage = config.env;
        this.region = config.input.region;
        this.branch = config.input.branch;
        this.baseEnvironment = config.input.baseEnvironment;
        this.includeApps = config.input.includeApps;
        this.excludeApps = config.input.excludeApps;
    }
    async deploy() {
        const triggerResp = await lambda.invoke({
            FunctionName: 'arn:aws:lambda:us-east-1:022393549274:function:dynamic-environment-service-dev-provisionDynamicEnvironment',
            Payload: JSON.stringify({
                name: this.stage,
                branch: this.branch,
                baseEnvironment: this.baseEnvironment,
                includeApps: this.includeApps,
                excludeApps: this.excludeApps
            })
        }).promise();
        const buildPayload = JSON.parse(triggerResp.Payload);
        if (buildPayload.message) {
            console.log(buildPayload.message);
        }
        else {
            console.error(buildPayload);
        }
        if (buildPayload.buildId) {
            await this.cloudwatchSubscribe(buildPayload.buildId, undefined);
        }
        return {
            outputs: []
        };
    }
    async cloudwatchSubscribe(buildId, lastTime) {
        var _a, _b;
        let build;
        do {
            const buildInfo = await codebuild.batchGetBuilds({ ids: [buildId] }).promise();
            build = buildInfo.builds ? buildInfo.builds[0] : { logs: undefined };
        } while (!(((_a = build.logs) === null || _a === void 0 ? void 0 : _a.groupName) && ((_b = build.logs) === null || _b === void 0 ? void 0 : _b.streamName)));
        let forwardToken = '';
        let nextTime = new Date().valueOf();
        do {
            let logEvents = await logs.getLogEvents({
                logGroupName: build.logs.groupName,
                logStreamName: build.logs.streamName,
                startTime: lastTime,
                endTime: nextTime,
                nextToken: forwardToken === '' ? undefined : forwardToken,
                startFromHead: true
            }).promise();
            for (var event of logEvents.events) {
                console.log((new Date(event.timestamp)).toISOString(), event.message);
            }
            forwardToken = (logEvents.nextForwardToken === forwardToken) ? undefined : forwardToken;
        } while (forwardToken);
        if (build.buildStatus ? ['IN_PROGRESS'].includes(build.buildStatus) : false) {
            await new Promise(resolve => setTimeout(resolve, 60000));
            await this.cloudwatchSubscribe(buildId, nextTime);
        }
    }
}
module.exports = DsicollectionDynamicEnvironment;
