// ncm.js

const axios = require('axios');
const _ = require('lodash');

class NcmClient {
  constructor(apiKeys = {}, logEvents = true, retries = 5, retryBackoffFactor = 2, retryOn = [408, 504, 503], baseUrl = process.env.CP_BASE_URL || 'https://www.cradlepointecm.com/api/v2') {
    this.logEvents = logEvents;
    this.baseUrl = baseUrl;
    this.apiKeys = this.validateApiKeys(apiKeys);
    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Content-Type': 'application/json',
        ...this.apiKeys
      },
      timeout: 10000,
      retry: retries,
      retryDelay: (retryCount) => {
        return retryBackoffFactor * 1000 * retryCount;
      }
    });
  }

  validateApiKeys(apiKeys) {
    const requiredKeys = ['X-CP-API-ID', 'X-CP-API-KEY', 'X-ECM-API-ID', 'X-ECM-API-KEY'];
    requiredKeys.forEach(key => {
      if (!apiKeys[key]) {
        throw new Error(`${key} missing. Please ensure all API Keys are present.`);
      }
    });
    return apiKeys;
  }

  setApiKeys(apiKeys) {
    this.apiKeys = this.validateApiKeys(apiKeys);
    this.axiosInstance.defaults.headers = {
      ...this.axiosInstance.defaults.headers,
      ...this.apiKeys
    };
  }

  async getJson(getUrl, callType, params = {}) {
    let results = [];
    let url = getUrl;

    if (params.limit === 'all') {
      params.limit = 1000000;
    }

    while (url) {
      const response = await this.axiosInstance.get(url, { params });
      this.returnHandler(response.status, response.data, callType);
      url = _.get(response, 'data.meta.next');
      results = [...results, ...response.data.data];

      if (results.length >= params.limit) {
        break;
      }
    }

    return results;
  }

  returnHandler(statusCode, returnText, objType) {
    switch (statusCode) {
      case 200:
      case 201:
      case 202:
        if (this.logEvents) {
          console.log(`${objType} Operation Successful`);
        }
        break;
      case 204:
        if (this.logEvents) {
          console.log(`${objType} Deleted Successfully`);
        }
        break;
      case 400:
        if (this.logEvents) {
          console.log('Bad Request');
        }
        break;
      case 401:
        if (this.logEvents) {
          console.log('Unauthorized Access');
        }
        break;
      case 404:
        if (this.logEvents) {
          console.log('Resource Not Found');
        }
        break;
      case 500:
        if (this.logEvents) {
          console.log('HTTP 500 - Server Error');
        }
        break;
      default:
        console.log(`HTTP Status Code: ${statusCode} - No returned data`);
    }
  }

  parseKwargs(kwargs, allowedParams) {
    let params = _.pick(kwargs, allowedParams);

    for (let key in params) {
      if (Array.isArray(params[key])) {
        params[key] = params[key].join(',');
      }
    }

    if (!params.limit) {
      params.limit = '500';
    }

    const badParams = _.omit(kwargs, allowedParams);
    if (!_.isEmpty(badParams)) {
      throw new Error(`Invalid parameters: ${JSON.stringify(badParams)}`);
    }

    return params;
  }

  chunkParam(param) {
    const n = 100;
    let paramList = [];

    if (_.isString(param)) {
      paramList = param.split(",");
    } else if (_.isArray(param)) {
      paramList = param;
    } else {
      throw new TypeError("Invalid param format. Must be str or list.");
    }

    return _.chunk(paramList, n);
  }

  //Start methods here...

  async getAccounts(kwargs = {}) {
    const callType = 'Accounts';
    const getUrl = `${this.baseUrl}/accounts/`;
    const allowedParams = ['account', 'account__in', 'fields', 'id', 'id__in', 'name', 'name__in', 'expand', 'limit', 'offset'];
    const params = this.parseKwargs(kwargs, allowedParams);
    return await this.getJson(getUrl, callType, params);
  }

  async getAccountById(accountId) {
    const accounts = await this.getAccounts({ id: accountId });
    return accounts[0];
  }

  async getAccountByName(accountName) {
    const accounts = await this.getAccounts({ name: accountName });
    return accounts[0];
  }

  async createSubaccountByParentId(parentAccountId, subaccountName) {
    const callType = 'Subaccount';
    const postUrl = `${this.baseUrl}/accounts/`;

    const postData = {
      account: `/api/v1/accounts/${parentAccountId}/`,
      name: subaccountName
    };

    const response = await this.axiosInstance.post(postUrl, postData);
    this.returnHandler(response.status, response.data, callType);
    return response.data;
  }

  async createSubaccountByParentName(parentAccountName, subaccountName) {
    const parentAccount = await this.getAccountByName(parentAccountName);
    return await this.createSubaccountByParentId(parentAccount.id, subaccountName);
  }

  async renameSubaccountById(subaccountId, newSubaccountName) {
    const callType = 'Subaccount';
    const putUrl = `${this.baseUrl}/accounts/${subaccountId}/`;
    const putData = {
      name: newSubaccountName
    };

    const response = await this.axiosInstance.put(putUrl, putData);
    this.returnHandler(response.status, response.data, callType);
    return response.data;
  }

  async renameSubaccountByName(subaccountName, newSubaccountName) {
    const subaccount = await this.getAccountByName(subaccountName);
    return await this.renameSubaccountById(subaccount.id, newSubaccountName);
  }

  async deleteSubaccountById(subaccountId) {
    const callType = 'Subaccount';
    const deleteUrl = `${this.baseUrl}/accounts/${subaccountId}`;

    const response = await this.axiosInstance.delete(deleteUrl);
    this.returnHandler(response.status, response.data, callType);
    return response.data;
  }

  async deleteSubaccountByName(subaccountName) {
    const subaccount = await this.getAccountByName(subaccountName);
    return await this.deleteSubaccountById(subaccount.id);
  }

  async getActivityLogs(params = {}) {
    const allowedParams = ['account', 'created_at__exact', 'created_at__lt',
      'created_at__lte', 'created_at__gt', 'created_at__gte', 'action__timestamp__exact',
      'action__timestamp__lt', 'action__timestamp__lte', 'action__timestamp__gt',
      'action__timestamp__gte', 'actor__id', 'object__id', 'action__id__exact', 'actor__type',
      'action__type', 'object__type', 'order_by', 'limit'];
    params = this.parseKwargs(params, allowedParams);
    const getUrl = `${this.baseUrl}/activity_logs/`;
    return this.getJson(getUrl, 'Activity Logs', params);
  }

  async getAlerts(params = {}) {
    const allowedParams = ['account', 'created_at', 'created_at_timeuuid',
      'detected_at', 'friendly_info', 'info', 'router', 'type', 'order_by', 'limit', 'offset'];
    params = this.parseKwargs(params, allowedParams);
    const getUrl = `${this.baseUrl}/alerts/`;
    return this.getJson(getUrl, 'Alerts', params);
  }

  async getConfigurationManagers(params = {}) {
    const allowedParams = ['account', 'account__in', 'fields', 'id', 'id__in',
      'router', 'router__in', 'synched', 'suspended', 'expand', 'limit', 'offset'];
    params = this.parseKwargs(params, allowedParams);
    const getUrl = `${this.baseUrl}/configuration_managers/`;
    return this.getJson(getUrl, 'Configuration Managers', params);
  }

  async getConfigurationManagerId(routerId, params = {}) {
    const allowedParams = ['account', 'account__in', 'id', 'id__in', 'router',
      'router__in', 'synched', 'suspended', 'expand', 'limit', 'offset'];
    params = this.parseKwargs(params, allowedParams);
    const getUrl = `${this.baseUrl}/configuration_managers/?router.id=${routerId}&fields=id`;
    const result = await this.getJson(getUrl, 'Configuration Managers', params);
    return result[0]['id'];
  }

  async updateConfigurationManagers(configManId, configManJson) {
    const putUrl = `${this.baseUrl}/configuration_managers/${configManId}/`;
    const response = await this.axiosInstance.put(putUrl, configManJson);
    this.returnHandler(response.status, response.data, 'Configuration Manager');
    return response.data;
  }

  async patchConfigurationManagers(routerId, configManJson) {
    const getUrl = `${this.baseUrl}/configuration_managers/?router.id=${routerId}&fields=id`;
    const response = await this.axiosInstance.get(getUrl);
    const configManId = response.data.data[0]['id'];
    const patchUrl = `${this.baseUrl}/configuration_managers/${configManId}/`;
    const responsePatch = await this.axiosInstance.patch(patchUrl, configManJson);
    this.returnHandler(responsePatch.status, responsePatch.data, 'Configuration Manager');
    return responsePatch.data;
  }

  async putConfigurationManagers(routerId, configManJson) {
    const getUrl = `${this.baseUrl}/configuration_managers/?router.id=${routerId}&fields=id`;
    const response = await this.axiosInstance.get(getUrl);
    const configManId = response.data.data[0]['id'];
    const putUrl = `${this.baseUrl}/configuration_managers/${configManId}/?fields=configuration`;
    const responsePut = await this.axiosInstance.put(putUrl, configManJson);
    this.returnHandler(responsePut.status, responsePut.data, 'Configuration Manager');
    return responsePut.data;
  }

  async patchGroupConfiguration(groupId, configJson) {
    const patchUrl = `${this.baseUrl}/groups/${groupId}/`;
    const response = await this.axiosInstance.patch(patchUrl, configJson);
    this.returnHandler(response.status, response.data, 'Configuration Manager');
    return response.data;
  }

  async copyRouterConfiguration(srcRouterId, dstRouterId) {
    const srcConfig = await this.getConfigurationManagers({ router: srcRouterId, fields: 'configuration' });
    let srcConfigStr = JSON.stringify(srcConfig[0]);
    srcConfigStr = srcConfigStr.replace(', "wpapsk": "*"', '').replace('"wpapsk": "*"', '').replace(', "password": "*"', '').replace('"password": "*"', '');
    const dstConfigManId = (await this.getConfigurationManagers({ router: dstRouterId }))[0]['id'];
    const patchUrl = `${this.baseUrl}/configuration_managers/${dstConfigManId}/`;
    const response = await this.axiosInstance.patch(patchUrl, srcConfigStr);
    this.returnHandler(response.status, response.data, 'Configuration Manager');
    return response.data;
  }

  async resumeUpdatesForRouter(routerId) {
    const getUrl = `${this.baseUrl}/configuration_managers/?router.id=${routerId}&fields=id`;
    const response = await this.axiosInstance.get(getUrl);
    const configManId = response.data.data[0]['id'];
    const putUrl = `${this.baseUrl}/configuration_managers/${configManId}/`;
    const responsePut = await this.axiosInstance.put(putUrl, { suspended: false });
    this.returnHandler(responsePut.status, responsePut.data, 'Configuration Manager');
    return responsePut.data;
  }

  async getDeviceAppBindings(params = {}) {
    const allowedParams = ['account', 'account__in', 'group', 'group__in', 'app_version', 'app_version__in', 'id', 'id__in', 'state', 'state__in', 'expand', 'limit', 'offset'];
    params = this.parseKwargs(params, allowedParams);
    const getUrl = `${this.baseUrl}/device_app_bindings/`;
    return this.getJson(getUrl, 'Device App Bindings', params);
  }

  async getDeviceAppStates(params = {}) {
    const allowedParams = ['account', 'account__in', 'router', 'router__in', 'app_version', 'app_version__in', 'id', 'id__in', 'state', 'state__in', 'expand', 'limit', 'offset'];
    params = this.parseKwargs(params, allowedParams);
    const getUrl = `${this.baseUrl}/device_app_states/`;
    return this.getJson(getUrl, 'Device App States', params);
  }

  async getDeviceAppVersions(params = {}) {
    const allowedParams = ['account', 'account__in', 'app', 'app__in', 'id', 'id__in', 'state', 'state__in', 'expand', 'limit', 'offset'];
    params = this.parseKwargs(params, allowedParams);
    const getUrl = `${this.baseUrl}/device_app_versions/`;
    return this.getJson(getUrl, 'Device App Versions', params);
  }

  async getDeviceApps(params = {}) {
    const allowedParams = ['account', 'account__in', 'name', 'name__in', 'id', 'id__in', 'uuid', 'uuid__in', 'expand', 'order_by', 'limit', 'offset'];
    params = this.parseKwargs(params, allowedParams);
    const getUrl = `${this.baseUrl}/device_apps/`;
    return this.getJson(getUrl, 'Device Apps', params);
  }

  async getFailovers(params = {}) {
    const allowedParams = ['account_id', 'group_id', 'router_id', 'started_at', 'ended_at', 'order_by', 'limit', 'offset'];
    params = this.parseKwargs(params, allowedParams);
    const getUrl = `${this.baseUrl}/failovers/`;
    return this.getJson(getUrl, 'Failovers', params);
  }

  async getFirmwares(params = {}) {
    const allowedParams = ['id', 'id__in', 'version', 'version__in', 'limit', 'offset'];
    params = this.parseKwargs(params, allowedParams);
    const getUrl = `${this.baseUrl}/firmwares/`;
    return this.getJson(getUrl, 'Firmwares', params);
  }

  async getFirmwareForProductIdByVersion(productId, firmwareName) {
    const firmwares = await this.getFirmwares({ version: firmwareName });
    for (let f of firmwares) {
      if (f['product'] === `${this.baseUrl}/products/${productId}/`) {
        return f;
      }
    }
    throw new Error("Invalid Firmware Version");
  }

  async getFirmwareForProductNameByVersion(productName, firmwareName) {
    const product = await this.getProductByName(productName);
    return this.getFirmwareForProductIdByVersion(product['id'], firmwareName);
  }

  async getGroups(params = {}) {
    const allowedParams = ['account', 'account__in', 'id', 'id__in', 'name', 'name__in', 'expand', 'limit', 'offset'];
    params = this.parseKwargs(params, allowedParams);
    const getUrl = `${this.baseUrl}/groups/`;
    return this.getJson(getUrl, 'Groups', params);
  }

  async getGroupById(groupId) {
    const groups = await this.getGroups({ id: groupId });
    return groups[0];
  }

  async getGroupByName(groupName) {
    const groups = await this.getGroups({ name: groupName });
    return groups[0];
  }

  async createGroupByParentId(parentAccountId, groupName, productName, firmwareVersion) {
    const postUrl = `${this.baseUrl}/groups/`;
    const firmware = await this.getFirmwareForProductNameByVersion(productName, firmwareVersion);
    const product = await this.getProductByName(productName);
    const postData = {
      account: `/api/v1/accounts/${parentAccountId}/`,
      name: groupName,
      product: product['resource_url'],
      target_firmware: firmware['resource_url']
    };
    const response = await this.axiosInstance.post(postUrl, postData);
    this.returnHandler(response.status, response.data, 'Group');
    return response.data;
  }

  async createGroupByParentName(parentAccountName, groupName, productName, firmwareVersion) {
    const parentAccount = await this.getAccountByName(parentAccountName);
    return this.createGroupByParentId(parentAccount['id'], groupName, productName, firmwareVersion);
  }

  async renameGroupById(groupId, newGroupName) {
    const putUrl = `${this.baseUrl}/groups/${groupId}/`;
    const putData = { name: newGroupName };
    const response = await this.axiosInstance.put(putUrl, putData);
    this.returnHandler(response.status, response.data, 'Group');
    return response.data;
  }

  async renameGroupByName(existingGroupName, newGroupName) {
    const group = await this.getGroupByName(existingGroupName);
    return this.renameGroupById(group['id'], newGroupName);
  }

  async deleteGroupById(groupId) {
    const deleteUrl = `${this.baseUrl}/groups/${groupId}/`;
    const response = await this.axiosInstance.delete(deleteUrl);
    this.returnHandler(response.status, response.data, 'Group');
    return response.data;
  }

  async deleteGroupByName(groupName) {
    const group = await this.getGroupByName(groupName);
    return this.deleteGroupById(group['id']);
  }

  // Resume testing here...

  async getHistoricalLocations(routerId, params = {}) {
    const allowedParams = ['created_at__gt', 'created_at_timeuuid__gt', 'created_at__lte', 'fields', 'limit', 'offset'];
    params = this.parseKwargs(params, allowedParams);
    const getUrl = `${this.baseUrl}/historical_locations/?router=${routerId}`;
    return this.getJson(getUrl, 'Historical Locations', params);
  }

  async getHistoricalLocationsForDate(routerId, date, tzoffsetHrs = 0, limit = 'all', params = {}) {
    const d = new Date(date);
    d.setHours(d.getHours() + tzoffsetHrs);
    const start = d.toISOString();
    d.setHours(d.getHours() + 24);
    const end = d.toISOString();
    const allowedParams = ['created_at__gt', 'created_at_timeuuid__gt', 'created_at__lte', 'fields', 'limit', 'offset'];
    params = this.parseKwargs(params, allowedParams);
    params['created_at__lte'] = end;
    params['created_at__gt'] = start;
    params['limit'] = limit;
    const getUrl = `${this.baseUrl}/historical_locations/?router=${routerId}`;
    return this.getJson(getUrl, 'Historical Locations', params);
  }

  async getLocations(params = {}) {
    const allowedParams = ['id', 'id__in', 'router', 'router__in', 'limit', 'offset'];
    params = this.parseKwargs(params, allowedParams);
    const getUrl = `${this.baseUrl}/locations/`;
    return this.getJson(getUrl, 'Locations', params);
  }

  async createLocation(accountId, latitude, longitude, routerId) {
    const postUrl = `${this.baseUrl}/locations/`;
    const postData = {
      account: `https://www.cradlepointecm.com/api/v2/accounts/${accountId}/`,
      accuracy: 0,
      latitude: latitude,
      longitude: longitude,
      method: 'manual',
      router: `https://www.cradlepointecm.com/api/v2/routers/${routerId}/`
    };
    const response = await this.axiosInstance.post(postUrl, postData);
    this.returnHandler(response.status, response.data, 'Locations');
    return response.data;
  }

  async deleteLocationForRouter(routerId) {
    const locations = await this.getLocations({ router: routerId });
    if (locations.length > 0) {
      const locationId = locations[0]['id'];
      const deleteUrl = `${this.baseUrl}/locations/${locationId}/`;
      const response = await this.axiosInstance.delete(deleteUrl);
      this.returnHandler(response.status, response.data, 'Locations');
      return response.data;
    } else {
      return "NO LOCATION FOUND";
    }
  }

  // Day 2e start

  async getNetDeviceHealth(params = {}) {
    const allowedParams = ['net_device'];
    params = this.parseKwargs(params, allowedParams);
    const getUrl = `${this.baseUrl}/net_device_health/`;
    return this.getJson(getUrl, 'Net Device Health', params);
  }

  async getNetDeviceMetrics(params = {}) {
    const allowedParams = ['net_device', 'net_device__in', 'update_ts__lt', 'update_ts__gt', 'limit', 'offset'];
    params = this.parseKwargs(params, allowedParams);
    const getUrl = `${this.baseUrl}/net_device_metrics/`;
    return this.getJson(getUrl, 'Net Device Metrics', params);
  }

  async getNetDevicesMetricsForWan(params = {}) {
    const netDevices = await this.getNetDevices({ mode: 'wan' });
    const ids = netDevices.map(device => device.id);
    const idString = ids.join(',');
    return this.getNetDeviceMetrics({ net_device__in: idString, ...params });
  }

  async getNetDevicesMetricsForMdm(params = {}) {
    const netDevices = await this.getNetDevices({ is_asset: true });
    const ids = netDevices.map(device => device.id);
    const idString = ids.join(',');
    return this.getNetDeviceMetrics({ net_device__in: idString, ...params });
  }

  async getNetDeviceSignalSamples(params = {}) {
    const allowedParams = ['net_device', 'net_device__in', 'created_at', 'created_at__lt', 'created_at__gt', 'created_at_timeuuid', 'created_at_timeuuid__in', 'created_at_timeuuid__gt', 'created_at_timeuuid__gte', 'created_at_timeuuid__lt', 'created_at_timeuuid__lte', 'order_by', 'limit', 'offset'];
    params = this.parseKwargs(params, allowedParams);
    const getUrl = `${this.baseUrl}/net_device_signal_samples/`;
    return this.getJson(getUrl, 'Get Net Device Signal Samples', params);
  }

  async getNetDeviceUsageSamples(params = {}) {
    const allowedParams = ['net_device', 'net_device__in', 'created_at', 'created_at__lt', 'created_at__gt', 'created_at_timeuuid', 'created_at_timeuuid__in', 'created_at_timeuuid__gt', 'created_at_timeuuid__gte', 'created_at_timeuuid__lt', 'created_at_timeuuid__lte', 'order_by', 'limit', 'offset'];
    params = this.parseKwargs(params, allowedParams);
    const getUrl = `${this.baseUrl}/net_device_usage_samples/`;
    return this.getJson(getUrl, 'Net Device Usage Samples', params);
  }

  async getNetDevices(params = {}) {
    const allowedParams = ['account', 'account__in', 'connection_state', 'connection_state__in', 'fields', 'id', 'id__in', 'is_asset', 'ipv4_address', 'ipv4_address__in', 'mode', 'mode__in', 'router', 'router__in', 'expand', 'limit', 'offset'];
    params = this.parseKwargs(params, allowedParams);
    const getUrl = `${this.baseUrl}/net_devices/`;
    return this.getJson(getUrl, 'Net Devices', params);
  }

  async getNetDevicesForRouter(routerId, params = {}) {
    return this.getNetDevices({ router: routerId, ...params });
  }

  async getNetDevicesForRouterByMode(routerId, mode, params = {}) {
    return this.getNetDevices({ router: routerId, mode: mode, ...params });
  }

  async getProducts(params = {}) {
    const allowedParams = ['id', 'id__in', 'limit', 'offset'];
    params = this.parseKwargs(params, allowedParams);
    const getUrl = `${this.baseUrl}/products/`;
    return this.getJson(getUrl, 'Products', params);
  }

  async getProductById(productId) {
    const products = await this.getProducts({ id: productId });
    return products[0];
  }

  async getProductByName(productName) {
    const products = await this.getProducts();
    for (let p of products) {
      if (p.name === productName) {
        return p;
      }
    }
    throw new Error("Invalid Product Name");
  }

  async rebootDevice(routerId) {
    const postUrl = `${this.baseUrl}/reboot_activity/`;
    const postData = {
      router: `${this.baseUrl}/routers/${routerId}/`
    };
    const response = await this.axiosInstance.post(postUrl, postData);
    this.returnHandler(response.status, response.data, 'Reboot Device');
    return response.data;
  }

  async rebootGroup(groupId) {
    const postUrl = `${this.baseUrl}/reboot_activity/`;
    const postData = {
      group: `${this.baseUrl}/groups/${groupId}/`
    };
    const response = await this.axiosInstance.post(postUrl, postData);
    this.returnHandler(response.status, response.data, 'Reboot Group');
    return response.data;
  }

  async getRouterAlerts(params = {}) {
    const allowedParams = ['router', 'router__in', 'created_at', 'created_at__lt', 'created_at__gt', 'created_at_timeuuid', 'created_at_timeuuid__in', 'created_at_timeuuid__gt', 'created_at_timeuuid__gte', 'created_at_timeuuid__lt', 'created_at_timeuuid__lte', 'order_by', 'limit', 'offset'];
    params = this.parseKwargs(params, allowedParams);
    const getUrl = `${this.baseUrl}/router_alerts/`;
    return this.getJson(getUrl, 'Router Alerts', params);
  }

  async getRouterAlertsLast24Hrs(tzoffsetHrs = 0, params = {}) {
    const now = new Date();
    now.setHours(now.getHours() + tzoffsetHrs);
    const end = now.toISOString();
    now.setHours(now.getHours() - 24);
    const start = now.toISOString();
    const allowedParams = ['router', 'router__in'];
    params = this.parseKwargs(params, allowedParams);
    params.created_at__lt = end;
    params.created_at__gt = start;
    params.order_by = 'created_at_timeuuid';
    params.limit = '500';
    const getUrl = `${this.baseUrl}/router_alerts/`;
    return this.getJson(getUrl, 'Router Alerts', params);
  }

  async getRouterAlertsForDate(date, tzoffsetHrs = 0, params = {}) {
    const d = new Date(date);
    d.setHours(d.getHours() + tzoffsetHrs);
    const start = d.toISOString();
    d.setHours(d.getHours() + 24);
    const end = d.toISOString();
    const allowedParams = ['router', 'router__in'];
    params = this.parseKwargs(params, allowedParams);
    params.created_at__lt = end;
    params.created_at__gt = start;
    params.order_by = 'created_at_timeuuid';
    params.limit = '500';
    const getUrl = `${this.baseUrl}/router_alerts/`;
    return this.getJson(getUrl, 'Router Alerts', params);
  }

  async getRouterLogs(routerId, params = {}) {
    const allowedParams = ['created_at', 'created_at__lt', 'created_at__gt', 'created_at_timeuuid', 'created_at_timeuuid__in', 'created_at_timeuuid__gt', 'created_at_timeuuid__gte', 'created_at_timeuuid__lt', 'created_at_timeuuid__lte', 'order_by', 'limit', 'offset'];
    params = this.parseKwargs(params, allowedParams);
    const getUrl = `${this.baseUrl}/router_logs/?router=${routerId}`;
    return this.getJson(getUrl, 'Router Logs', params);
  }

  async getRouterLogsLast24Hrs(routerId, tzoffsetHrs = 0) {
    const now = new Date();
    now.setHours(now.getHours() + tzoffsetHrs);
    const end = now.toISOString();
    now.setHours(now.getHours() - 24);
    const start = now.toISOString();
    const params = {
      created_at__lt: end,
      created_at__gt: start,
      order_by: 'created_at_timeuuid',
      limit: '500'
    };
    const getUrl = `${this.baseUrl}/router_logs/?router=${routerId}`;
    return this.getJson(getUrl, 'Router Logs', params);
  }

  async getRouterLogsForDate(routerId, date, tzoffsetHrs = 0) {
    const d = new Date(date);
    d.setHours(d.getHours() + tzoffsetHrs);
    const start = d.toISOString();
    d.setHours(d.getHours() + 24);
    const end = d.toISOString();
    const params = {
      created_at__lt: end,
      created_at__gt: start,
      order_by: 'created_at_timeuuid',
      limit: '500'
    };
    const getUrl = `${this.baseUrl}/router_logs/?router=${routerId}`;
    return this.getJson(getUrl, 'Router Logs', params);
  }

  async getRouterStateSamples(params = {}) {
    const allowedParams = ['router', 'router__in', 'created_at', 'created_at__lt', 'created_at__gt', 'created_at_timeuuid', 'created_at_timeuuid__in', 'created_at_timeuuid__gt', 'created_at_timeuuid__gte', 'created_at_timeuuid__lt', 'created_at_timeuuid__lte', 'order_by', 'limit', 'offset'];
    params = this.parseKwargs(params, allowedParams);
    const getUrl = `${this.baseUrl}/router_state_samples/`;
    return this.getJson(getUrl, 'Router State Samples', params);
  }

  async getRouterStreamUsageSamples(params = {}) {
    const allowedParams = ['router', 'router__in', 'created_at', 'created_at__lt', 'created_at__gt', 'created_at_timeuuid', 'created_at_timeuuid__in', 'created_at_timeuuid__gt', 'created_at_timeuuid__gte', 'created_at_timeuuid__lt', 'created_at_timeuuid__lte', 'order_by', 'limit', 'offset'];
    params = this.parseKwargs(params, allowedParams);
    const getUrl = `${this.baseUrl}/router_stream_usage_samples/`;
    return this.getJson(getUrl, 'Router Stream Usage Samples', params);
  }

  async getRouters(params = {}) {
    const allowedParams = ['account', 'account__in', 'device_type', 'device_type__in', 'fields', 'group', 'group__in', 'id', 'id__in', 'ipv4_address', 'ipv4_address__in', 'mac', 'mac__in', 'name', 'name__in', 'reboot_required', 'reboot_required__in', 'state', 'state__in', 'state_updated_at__lt', 'state_updated_at__gt', 'updated_at__lt', 'updated_at__gt', 'expand', 'order_by', 'limit', 'offset'];
    params = this.parseKwargs(params, allowedParams);
    const getUrl = `${this.baseUrl}/routers/`;
    return this.getJson(getUrl, 'Routers', params);
  }

  async getRouterById(routerId, params = {}) {
    const routers = await this.getRouters({ ...params, id: routerId });
    return routers[0];
  }

  async getRouterByName(routerName, params = {}) {
    const routers = await this.getRouters({ ...params, name: routerName });
    return routers[0];
  }

  async getRoutersForAccount(accountId, params = {}) {
    return this.getRouters({ ...params, account: accountId });
  }

  async getRoutersForGroup(groupId, params = {}) {
    return this.getRouters({ ...params, group: groupId });
  }

  async renameRouterById(routerId, newRouterName) {
    const putUrl = `${this.baseUrl}/routers/${routerId}/`;
    const putData = { name: newRouterName };
    const response = await this.axiosInstance.put(putUrl, putData);
    this.returnHandler(response.status, response.data, 'Router');
    return response.data;
  }

  async renameRouterByName(existingRouterName, newRouterName) {
    const router = await this.getRouterByName(existingRouterName);
    return this.renameRouterById(router.id, newRouterName);
  }

  async assignRouterToGroup(routerId, groupId) {
    const putUrl = `${this.baseUrl}/routers/${routerId}/`;
    const putData = { group: `https://www.cradlepointecm.com/api/v2/groups/${groupId}/` };
    const response = await this.axiosInstance.put(putUrl, putData);
    this.returnHandler(response.status, response.data, 'Router');
    return response.data;
  }

  async removeRouterFromGroup(routerId = null, routerName = null) {
    if (!routerId && !routerName) {
      throw new Error('Either Router ID or Router Name must be specified.');
    }
    if (!routerId) {
      const router = await this.getRouterByName(routerName);
      routerId = router.id;
    }
    const putUrl = `${this.baseUrl}/routers/${routerId}/`;
    const putData = { group: null };
    const response = await this.axiosInstance.put(putUrl, putData);
    this.returnHandler(response.status, response.data, 'Router');
    return response.data;
  }

  async assignRouterToAccount(routerId, accountId) {
    const putUrl = `${this.baseUrl}/routers/${routerId}/`;
    const putData = { account: `https://www.cradlepointecm.com/api/v2/accounts/${accountId}/` };
    const response = await this.axiosInstance.put(putUrl, putData);
    this.returnHandler(response.status, response.data, 'Routers');
    return response.data;
  }

  async deleteRouterById(routerId) {
    const deleteUrl = `${this.baseUrl}/routers/${routerId}/`;
    const response = await this.axiosInstance.delete(deleteUrl);
    this.returnHandler(response.status, response.data, 'Router');
    return response.data;
  }

  async deleteRouterByName(routerName) {
    const router = await this.getRouterByName(routerName);
    return this.deleteRouterById(router.id);
  }

  async createSpeedTest(netDeviceIds, accountId = null, host = "netperf-west.bufferbloat.net", maxTestConcurrency = 5, port = 12865, size = null, testTimeout = 10, testType = "TCP Download", time = 10) {
    if (!accountId) {
      const accounts = await this.getAccounts();
      accountId = accounts[0].id;
    }
    const postUrl = `${this.baseUrl}/speed_test/`;
    const postData = {
      account: `https://www.cradlepointecm.com/api/v2/accounts/${accountId}/`,
      config: {
        host,
        max_test_concurrency: maxTestConcurrency,
        net_device_ids: netDeviceIds,
        port,
        size,
        test_timeout: testTimeout,
        test_type: testType,
        time
      }
    };
    const response = await this.axiosInstance.post(postUrl, postData);
    this.returnHandler(response.status, response.data, 'Speed Test');
    return response.data;
  }

  async createSpeedTestMdm(routerId, accountId = null, host = "netperf-west.bufferbloat.net", maxTestConcurrency = 5, port = 12865, size = null, testTimeout = 10, testType = "TCP Download", time = 10) {
    const netDevices = await this.getNetDevicesForRouter(routerId, { connection_state: 'connected', is_asset: true });
    const netDeviceIds = netDevices.map(device => device.id);
    return this.createSpeedTest(netDeviceIds, accountId, host, maxTestConcurrency, port, size, testTimeout, testType, time);
  }

  async getSpeedTest(speedTestId) {
    const getUrl = `${this.baseUrl}/speed_test/${speedTestId}/`;
    const response = await this.axiosInstance.get(getUrl);
    return response.data;
  }

  async setLanIpAddress(routerId, lanIp, netmask = null, networkId = 0) {
    const response = await this.axiosInstance.get(`${this.baseUrl}/configuration_managers/`, { params: { 'router.id': routerId, fields: 'id' } });
    const configManId = response.data[0].id;
    const payload = {
      configuration: [
        {
          lan: {
            [networkId]: {
              ip_address: lanIp,
              ...(netmask && { netmask })
            }
          }
        },
        []
      ]
    };
    const patchUrl = `${this.baseUrl}/configuration_managers/${configManId}/`;
    const patchResponse = await this.axiosInstance.patch(patchUrl, payload);
    this.returnHandler(patchResponse.status, patchResponse.data, 'LAN IP Address');
    return patchResponse.data;
  }

  async setCustom1(routerId, text) {
    const putUrl = `${this.baseUrl}/routers/${routerId}/`;
    const putData = { custom1: text };
    const response = await this.axiosInstance.put(putUrl, putData);
    this.returnHandler(response.status, response.data, 'NCM Field Update');
    return response.data;
  }

  async setCustom2(routerId, text) {
    const putUrl = `${this.baseUrl}/routers/${routerId}/`;
    const putData = { custom2: text };
    const response = await this.axiosInstance.put(putUrl, putData);
    this.returnHandler(response.status, response.data, 'NCM Field Update');
    return response.data;
  }

  async setAdminPassword(routerId, newPassword) {
    const response = await this.axiosInstance.get(`${this.baseUrl}/configuration_managers/`, { params: { 'router.id': routerId, fields: 'id' } });
    const configManId = response.data[0].id;
    const payload = {
      configuration: [
        {
          system: {
            users: {
              "0": {
                password: newPassword
              }
            }
          }
        },
        []
      ]
    };
    const patchUrl = `${this.baseUrl}/configuration_managers/${configManId}/`;
    const patchResponse = await this.axiosInstance.patch(patchUrl, payload);
    this.returnHandler(patchResponse.status, patchResponse.data, 'Admin Password');
    return patchResponse.data;
  }

  async setRouterName(routerId, newRouterName) {
    const response = await this.axiosInstance.get(`${this.baseUrl}/configuration_managers/`, { params: { 'router.id': routerId, fields: 'id' } });
    const configManId = response.data[0].id;
    const payload = {
      configuration: [
        {
          system: {
            system_id: newRouterName
          }
        },
        []
      ]
    };
    const patchUrl = `${this.baseUrl}/configuration_managers/${configManId}/`;
    const patchResponse = await this.axiosInstance.patch(patchUrl, payload);
    this.returnHandler(patchResponse.status, patchResponse.data, 'Router Name');
    return patchResponse.data;
  }

  async setRouterDescription(routerId, newRouterDescription) {
    const response = await this.axiosInstance.get(`${this.baseUrl}/configuration_managers/`, { params: { 'router.id': routerId, fields: 'id' } });
    const configManId = response.data[0].id;
    const payload = {
      configuration: [
        {
          system: {
            desc: newRouterDescription
          }
        },
        []
      ]
    };
    const patchUrl = `${this.baseUrl}/configuration_managers/${configManId}/`;
    const patchResponse = await this.axiosInstance.patch(patchUrl, payload);
    this.returnHandler(patchResponse.status, patchResponse.data, 'Description');
    return patchResponse.data;
  }

  async setRouterAssetId(routerId, newRouterAssetId) {
    const response = await this.axiosInstance.get(`${this.baseUrl}/configuration_managers/`, { params: { 'router.id': routerId, fields: 'id' } });
    const configManId = response.data[0].id;
    const payload = {
      configuration: [
        {
          system: {
            asset_id: newRouterAssetId
          }
        },
        []
      ]
    };
    const patchUrl = `${this.baseUrl}/configuration_managers/${configManId}/`;
    const patchResponse = await this.axiosInstance.patch(patchUrl, payload);
    this.returnHandler(patchResponse.status, patchResponse.data, 'Asset ID');
    return patchResponse.data;
  }

  async setEthernetWanIp(routerId, newWanIp, newNetmask = null, newGateway = null) {
    const response = await this.axiosInstance.get(`${this.baseUrl}/configuration_managers/`, { params: { 'router.id': routerId, fields: 'id' } });
    const configManId = response.data[0].id;
    const ipOverride = {
      ip_address: newWanIp,
      ...(newNetmask && { netmask: newNetmask }),
      ...(newGateway && { gateway: newGateway })
    };
    const payload = {
      configuration: [
        {
          wan: {
            rules2: {
              "0": {
                ip_override: ipOverride
              }
            }
          }
        },
        []
      ]
    };
    const patchUrl = `${this.baseUrl}/configuration_managers/${configManId}/`;
    const patchResponse = await this.axiosInstance.patch(patchUrl, payload);
    this.returnHandler(patchResponse.status, patchResponse.data, 'Ethernet WAN IP Address');
    return patchResponse.data;
  }

  async addCustomApn(routerId, newCarrier, newApn) {
    const response = await this.axiosInstance.get(`${this.baseUrl}/configuration_managers/`, { params: { 'router.id': routerId, fields: 'id,configuration' } });
    const configManId = response.data[0].id;
    let newApnId = 0;
    try {
      if (response.data[0].configuration[0].wan && response.data[0].configuration[0].wan.custom_apns) {
        newApnId = response.data[0].configuration[0].wan.custom_apns.length;
      }
    } catch (error) {
    }
    const payload = {
      configuration: [
        {
          wan: {
            custom_apns: {
              [newApnId]: {
                apn: newApn,
                carrier: newCarrier
              }
            }
          }
        },
        []
      ]
    };
    const patchUrl = `${this.baseUrl}/configuration_managers/${configManId}/`;
    const patchResponse = await this.axiosInstance.patch(patchUrl, payload);
    this.returnHandler(patchResponse.status, patchResponse.data, 'Custom APN');
    return patchResponse.data;
  }

}

module.exports = NcmClient;
