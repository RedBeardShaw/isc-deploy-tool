import clc from "cli-color";
import * as fs from "fs";
import { GlobalTenantSecuritySettingsApi, PasswordConfigurationApi, PublicIdentitiesApi, PublicIdentitiesConfigApi } from "sailpoint-api-client";
import winston from "winston";
import { handleHttpException, walk, writeConfigFile } from "../util.js";
import path from "path";

const ORG_CONFIG = "ORG_CONFIG";
const PASSWORD_ORG_CONFIG = "PASSWORD_ORG_CONFIG";
const NETWORK_ORG_CONFIG = "NETWORK_ORG_CONFIG";
const SESSION_ORG_CONFIG = "SESSION_ORG_CONFIG";
const LOCKOUT_ORG_CONFIG = "LOCKOUT_ORG_CONFIG";
const SERVICE_PROVIDER_ORG_CONFIG = "SERVICE_PROVIDER_ORG_CONFIG";
const PUBLIC_IDENTITIES_ORG_CONFIG = "PUBLIC_IDENTITIES_ORG_CONFIG";

const exportOrgConfigs = async apiConfig => {
    winston.info(clc.bgBlueBright("Starting Org Config Export"));
    const globalTenantSecuritySettingsApi = new GlobalTenantSecuritySettingsApi(apiConfig);
    const passwordConfigApi = new PasswordConfigurationApi(apiConfig);

    winston.info("Exporting Network Org Config");
    const networkConfigResponse = await globalTenantSecuritySettingsApi.getAuthOrgNetworkConfigV1();
    writeConfigFile(ORG_CONFIG, NETWORK_ORG_CONFIG, networkConfigResponse.data);

    winston.info("Exporting Session Org Config");
    const sessionConfigResponse = await globalTenantSecuritySettingsApi.getAuthOrgSessionConfigV1();
    writeConfigFile(ORG_CONFIG, SESSION_ORG_CONFIG, sessionConfigResponse.data);

    winston.info("Exporting Lockout Org Config");
    const lockoutConfigResponse = await globalTenantSecuritySettingsApi.getAuthOrgLockoutConfigV1();
    writeConfigFile(ORG_CONFIG, LOCKOUT_ORG_CONFIG, lockoutConfigResponse.data);

    winston.info("Exporting Service Provider Org Config");
    const serviceProviderConfigResponse = await globalTenantSecuritySettingsApi.getAuthOrgServiceProviderConfigV1();
    writeConfigFile(ORG_CONFIG, SERVICE_PROVIDER_ORG_CONFIG, serviceProviderConfigResponse.data);

    winston.info("Exporting Password Org Config");
    const passwordConfigResponse = await passwordConfigApi.getPasswordOrgConfigV1();
    writeConfigFile(ORG_CONFIG, PASSWORD_ORG_CONFIG, passwordConfigResponse.data);

    winston.info("Exporting Public Identities Org Config");
    const publicIdentitiesConfigApi = new PublicIdentitiesConfigApi(apiConfig);
    const publicIdentitiesConfigResponse = await publicIdentitiesConfigApi.getPublicIdentityConfigV1();
    writeConfigFile(ORG_CONFIG, PUBLIC_IDENTITIES_ORG_CONFIG, publicIdentitiesConfigResponse.data);
};

const migrateOrgConfigs = async apiConfig => {
    winston.info(clc.bgBlueBright("Starting Org Config Deployment"));
    const globalTenantSecuritySettingsApi = new GlobalTenantSecuritySettingsApi(apiConfig);
    const orgConfigFilePaths = walk("./build/config/ORG_CONFIG");

    //Iterate each org config and use appropriate API to migrate it
    for (const orgConfigFilePath of orgConfigFilePaths) {
        const orgConfigSource = fs.readFileSync(orgConfigFilePath);
        const localOrgConfigSource = JSON.parse(orgConfigSource);

        const fileName = path.basename(orgConfigFilePath, path.extname(orgConfigFilePath));

        if (fileName === PASSWORD_ORG_CONFIG) {
            winston.info("Updating Password Org Config");
            const passwordConfigApi = new PasswordConfigurationApi(apiConfig);
            try {
                await passwordConfigApi.putPasswordOrgConfigV1({
                    passwordOrgConfig: localOrgConfigSource,
                });
            } catch (error) {
                handleHttpException(error);
            }
        } else if (fileName === NETWORK_ORG_CONFIG) {
            winston.info("Updating Network Org Config");
            try {
                await globalTenantSecuritySettingsApi.patchAuthOrgNetworkConfigV1({
                    jsonPatchOperation: [
                        {
                            op: "replace",
                            path: "/range",
                            value: localOrgConfigSource.range,
                        },
                        {
                            op: "replace",
                            path: "/geolocation",
                            value: localOrgConfigSource.geolocation,
                        },
                        {
                            op: "replace",
                            path: "/whitelisted",
                            value: localOrgConfigSource.whitelisted,
                        },
                    ],
                });
            } catch (error) {
                handleHttpException(error);
            }
        } else if (fileName === SESSION_ORG_CONFIG) {
            winston.info("Updating Session Org Config");
            try {
                await globalTenantSecuritySettingsApi.patchAuthOrgSessionConfigV1({
                    jsonPatchOperation: [
                        {
                            op: "replace",
                            path: "/maxSessionTime",
                            value: localOrgConfigSource.maxSessionTime,
                        },
                        {
                            op: "replace",
                            path: "/maxIdleTime",
                            value: localOrgConfigSource.maxIdleTime,
                        },
                        {
                            op: "replace",
                            path: "/rememberMe",
                            value: localOrgConfigSource.rememberMe,
                        },
                    ],
                });
            } catch (error) {
                handleHttpException(error);
            }
        } else if (fileName === LOCKOUT_ORG_CONFIG) {
            winston.info("Updating Lockout Org Config");
            try {
                await globalTenantSecuritySettingsApi.patchAuthOrgLockoutConfigV1({
                    jsonPatchOperation: [
                        {
                            op: "replace",
                            path: "/maximumAttempts",
                            value: localOrgConfigSource.maximumAttempts,
                        },
                        {
                            op: "replace",
                            path: "/lockoutDuration",
                            value: localOrgConfigSource.lockoutDuration,
                        },
                        {
                            op: "replace",
                            path: "/lockoutWindow",
                            value: localOrgConfigSource.lockoutWindow,
                        },
                    ],
                });
            } catch (error) {
                handleHttpException(error);
            }
        } else if (fileName === SERVICE_PROVIDER_ORG_CONFIG) {
            winston.info("Updating Service Provider Org Config");
            try {
                await globalTenantSecuritySettingsApi.patchAuthOrgServiceProviderConfigV1({
                    jsonPatchOperation: [
                        {
                            op: "replace",
                            path: "/enabled",
                            value: localOrgConfigSource.enabled,
                        },
                        {
                            op: "replace",
                            path: "/bypassIDP",
                            value: localOrgConfigSource.bypassIDP,
                        },
                        {
                            op: "replace",
                            path: "/federationProtocolDetails",
                            value: localOrgConfigSource.federationProtocolDetails,
                        },
                    ],
                });
            } catch (error) {
                handleHttpException(error);
            }
        } else if (fileName === PUBLIC_IDENTITIES_ORG_CONFIG) {
            winston.info("Updating Public Identities Org Config");
            try {
                const publicIdentitiesConfigApi = new PublicIdentitiesConfigApi(apiConfig);
                const publicIdentitiesConfigResponse = await publicIdentitiesConfigApi.updatePublicIdentityConfigV1({
                    publicIdentityConfig: localOrgConfigSource,
                });
            } catch (error) {
                handleHttpException(error);
            }
        }
    }
    winston.info(clc.bgGreen("Completed Org Config Deployment"));
};

export { exportOrgConfigs, migrateOrgConfigs };
