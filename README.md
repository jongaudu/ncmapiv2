Cradlepoint NCM APIv2 package

Created by: Jon Gaudu

Ported from: https://pypi.org/project/ncm/

Overview:
The purpose of this package is to make it easier for users to interact with
the Cradlepoint NCM APIv2. Within this package is a set of methods that
closely match the available API calls. Full documentation of the
Cradlepoint NCM API is available at https://developer.cradlepoint.com.

Requirements:
A set of Cradlepoint NCM APIv2 keys are required to make API calls.
While the class can be instantiated without supplying API keys,
any subsequent calls will fail unless the keys are set via the
set_api_keys() method.

Usage examples:
```javascript
const NcmClient = require('ncmapiv2');
async function main() {
const client = new NcmClient({
    'X-CP-API-ID': 'your',
    'X-CP-API-KEY': 'api',
    'X-ECM-API-ID': 'keys',
    'X-ECM-API-KEY': 'here'
});

// get accounts
const accounts = await client.getAccounts()
console.log(accounts);

// update configuration manager
const configManagerId = 1234567
const configUpdate = {"configuration": [{"system": {"system_id": "updated-system-id"}}, [] ]}
const updatedConfigManager = await client.updateConfigurationManagers(configManagerId, configUpdate);
console.log(updatedConfigManager);
}
```
Tips:
This package includes a few optimizations to make it easier to
work with the NCM APIv2. The default record limit is set at 500 instead of
the Cradlepoint default of 20, which reduces the number of API calls
required to return large sets of data.
This can be modified by specifying a limit parameter:

```javascript
const accounts = await client.getAccounts({ limit: 10 });
```
You can also return the full list of records in a single array without
the need for paging by passing { limit: 'all' }:

```javascript
const accounts = await client.getAccounts({ limit: 'all' });
```
It also has native support for handling any number of "__in" filters
beyond Cradlepoint's limit of 100. The script automatically chunks
the list into groups of 100 and combines the results into a single array.