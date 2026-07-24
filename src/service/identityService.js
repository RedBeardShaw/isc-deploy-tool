import clc from "cli-color";
import * as fs from "fs";
import _ from "lodash";
import { GovernanceGroupsApi, IdentitiesApi, Paginator } from "sailpoint-api-client";
import winston from "winston";
import { handleHttpException, walk, writeConfigFile } from "../util.js";

const GOVERNANCE_GROUP_TYPE = "GOVERNANCE_GROUP";
const existingAttributeToKeep = ["id"];

//Cache of identities we fetch during imports
let identityCache = {};
let govGroupCache = {};

const getIdentityByAlias = async (apiConfig, identityAlias) => {
    if (identityCache[identityAlias]) return identityCache[identityAlias];

    const identityApi = new IdentitiesApi(apiConfig);
    const identityResponse = await identityApi
        .listIdentitiesV1({
            filters: `alias eq "${identityAlias}"`,
            defaultFilter: "NONE", //Show hidden SailPoint identities
        })
        .catch(error => {
            handleHttpException(error);
        });

    if (!identityResponse || identityResponse.data.length === 0) {
        throw new Error(`Could not find identity for alias [${identityAlias}] in tenant: ${apiConfig.basePath}`);
    }

    identityCache[identityAlias] = identityResponse.data[0];
    return identityResponse.data[0];
};

const getIdentityById = async (apiConfig, identityId) => {
    if (identityCache[identityId]) return identityCache[identityId];

    const identityApi = new IdentitiesApi(apiConfig);
    const identityResponse = await identityApi
        .listIdentitiesV1({
            filters: `id eq "${identityId}"`,
            defaultFilter: "NONE", //Show hidden SailPoint identities
        })
        .catch(error => {
            handleHttpException(error);
        });

    if (!identityResponse || identityResponse.data.length === 0) {
        throw new Error(`Could not find identity for id [${identityId}] in tenant: ${apiConfig.basePath}`);
    }

    return identityResponse.data[0];
};

const getGovGroupByName = async (apiConfig, govGroupName) => {
    if (govGroupCache[govGroupName]) return govGroupCache[govGroupName];

    const govGroupApi = new GovernanceGroupsApi(apiConfig);
    const govGroupResponse = await govGroupApi
        .listWorkgroupsV1({
            filters: `name eq "${govGroupName}"`,
        })
        .catch(error => {
            handleHttpException(error);
        });

    if (!govGroupResponse || govGroupResponse.data.length === 0) {
        throw new Error(
            `Could not find governance group/workgroup for name [${govGroupName}] in tenant: ${apiConfig.basePath}`
        );
    }

    return govGroupResponse.data[0];
};

const getGovGroupById = async (apiConfig, govGroupId) => {
    if (govGroupCache[govGroupId]) return govGroupCache[govGroupId];

    const govGroupApi = new GovernanceGroupsApi(apiConfig);
    const govGroupResponse = await govGroupApi
        .getWorkgroup({
            id: govGroupId,
        })
        .catch(error => {
            handleHttpException(error);
        });

    if (!govGroupResponse) {
        throw new Error(
            `Could not find governance group/workgroup for id [${govGroupId}] in tenant: ${apiConfig.basePath}`
        );
    }

    return govGroupResponse.data;
};

const exportGovernanceGroups = async apiConfig => {
    winston.info(clc.bgBlueBright("Starting Governance Group Export"));
    const govGroupApi = new GovernanceGroupsApi(apiConfig);
    const govGroupsResponse = await Paginator.paginate(govGroupApi, govGroupApi.listWorkgroupsV1, undefined, 250).catch(
        error => {
            handleHttpException(error);
        }
    );
    for (const govGroup of govGroupsResponse.data) {
        winston.info(`Exporting Governance Group: ${govGroup.name} (${govGroup.id})`);
        writeConfigFile(GOVERNANCE_GROUP_TYPE, govGroup.name, govGroup);
    }
};

const migrateGovernanceGroup = async (apiConfig, govGroupJson) => {
    const govGroupApi = new GovernanceGroupsApi(apiConfig);
    let localGovGroup = JSON.parse(govGroupJson);

    //Looks up owner identity by tokenized alias
    const targetOwner = await getIdentityByAlias(apiConfig, localGovGroup.owner.name);

    //Update id and email reference incase it's different in target env
    localGovGroup.owner.id = targetOwner.id;
    localGovGroup.owner.email = targetOwner.email;

    //Check and see if a gov group with this name already exists in the target environment
    const currentGovGroupResponse = await govGroupApi
        .listWorkgroupsV1({
            filters: `name eq "${localGovGroup.name}"`,
        })
        .catch(error => {
            handleHttpException(error);
        });
    let currentTargetGovGroup = currentGovGroupResponse.data.length == 1 ? currentGovGroupResponse.data[0] : null;

    if (!currentTargetGovGroup) {
        winston.info(`Creating new governance group/workgroup: ${localGovGroup.name}`);
        const createGovGroupResponse = await govGroupApi
            .createWorkgroupV1({
                workgroupDto: {
                    name: localGovGroup.name,
                    description: localGovGroup.description,
                    owner: localGovGroup.owner,
                },
            })
            .catch(error => {
                handleHttpException(error);
            });
        currentTargetGovGroup = createGovGroupResponse.data;
    } else {
        winston.info(
            `Updating existing governance group/workgroup: ${currentTargetGovGroup.name} (${currentTargetGovGroup.id})`
        );
        //Restore attributes from the currently deployed target gov group into our template gov group
        for (const govGroupKey of existingAttributeToKeep) {
            _.set(localGovGroup, govGroupKey, _.get(currentTargetGovGroup, govGroupKey));
        }

        //Update the gov group with all config, references, etc.
        await govGroupApi
            .patchWorkgroupV1({
                id: currentTargetGovGroup.id,
                jsonPatchOperation: [
                    {
                        op: "replace",
                        path: "/description",
                        value: localGovGroup.description,
                    },
                ],
            })
            .catch(error => {
                handleHttpException(error);
            });
    }
};

const migrateGovernanceGroups = async apiConfig => {
    winston.info(clc.bgBlueBright("Starting Governance Group Deployment"));
    const governanceGroupsPaths = walk("./build/config/GOVERNANCE_GROUP");

    //Iterate each transform and pass it to migrateTransform
    for (const governanceGroupsPath of governanceGroupsPaths) {
        const governanceGroup = fs.readFileSync(governanceGroupsPath);
        await migrateGovernanceGroup(apiConfig, governanceGroup);
    }
};

export {
    exportGovernanceGroups,
    getGovGroupById,
    getGovGroupByName,
    getIdentityByAlias,
    getIdentityById,
    migrateGovernanceGroup,
    migrateGovernanceGroups,
};
