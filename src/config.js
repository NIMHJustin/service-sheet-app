// Connection settings for VetEquip's Microsoft 365 tenant.
// None of these values are secrets: they identify the app, the tenant and the site.

export const AUTH = {
  clientId: '3d3410ae-c96f-4147-83d7-dcc25c58b348',
  tenantId: '10109337-8f3a-4a1c-be74-4921905f225e',
  scopes: ['https://graph.microsoft.com/Sites.Selected', 'User.Read'],
};

export const SHAREPOINT = {
  // Graph site ID: hostname, site collection ID, web ID
  siteId: 'vetequip.sharepoint.com,ee2f1b11-847b-4791-a7b6-2a31294bc742,12fa5724-91bb-4e88-bb04-32bc68071380',
  recordsList: 'Service Records',
  partsList: 'Parts Used',
  certificatesLibrary: 'Service Certificates',
  fleetList: 'Fleet Vaporizers',
  movesList: 'Fleet Movements',
};

// Where fleet units sit when they are not out: shown as their location.
export const HOME_LOCATION = 'VetEquip';

// Annual efficacy test.
export const FLEET_TEST_MONTHS = 12;

export const GRAPH = 'https://graph.microsoft.com/v1.0';

export const DEFAULT_FEES = { full: '225.00', vap: '100.00' };

export const SUPPORT_PHONE = '800-466-6463';

// Accounts that see the Dashboard. This only hides the screen; the data itself is protected
// by SharePoint permissions.
export const DASHBOARD_USERS = ['justin@vetequip.com'];
