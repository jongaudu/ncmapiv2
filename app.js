// app.js

const { update } = require('lodash');
const NcmClient = require('./ncm.js');

async function main() {
  const client = new NcmClient({
    'X-CP-API-ID': '5d4b40cd',
    'X-CP-API-KEY': '4c1108d8b2da465588bb87bfe0cbbd2c',
    'X-ECM-API-ID': 'ee2ef022-c690-499f-82f4-dc5467daac98',
    'X-ECM-API-KEY': 'c08fc904b2b8d3d93ed0fe76e1e950b27157fa4c'
  });

  const account = 50811
  const srcRouterId = 3612579
  const dstRouterId = 3612589
  const configManId = 3618463
  const groupId = 372330
  const configUpdate = {"configuration": [{"system": {"system_id": "updated-system-id"}}, [] ]}

  // call getAccounts method and pass in the parameter 'limit' and set it equal to 'all'
  const groups = await client.getGroupById(groupId);

  console.log(groups);
  //console.log(configManager[0].actual);

}

main().catch(console.error);