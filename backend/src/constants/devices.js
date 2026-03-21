const DEVICE_LIST = [
  {
    id: 'led1',
    label: 'LED 1',
    aliases: ['led1', 'led 1', 'living room light'],
    dashboardType: 'bulb',
    dashboardIcon: 'bulb',
    actionIcon: '💡',
  },
  {
    id: 'led2',
    label: 'LED 2',
    aliases: ['led2', 'led 2', 'kitchen light', 'bedroom light'],
    dashboardType: 'bulb',
    dashboardIcon: 'bulb',
    actionIcon: '💡',
  },
  {
    id: 'fan',
    label: 'Ceiling Fan',
    aliases: ['fan', 'ceiling fan'],
    dashboardType: 'fan',
    dashboardIcon: 'fan',
    actionIcon: '🌀',
  },
  {
    id: 'ac',
    label: 'Air Conditioner',
    aliases: ['ac', 'air conditioner'],
    dashboardType: 'ac',
    dashboardIcon: 'ac',
    actionIcon: '❄️',
  },
];

const DEVICE_IDS = DEVICE_LIST.map((device) => device.id);
const DEVICE_LABEL_MAP = Object.fromEntries(DEVICE_LIST.map((device) => [device.id, device.label]));
const PUBLIC_DEVICE_LIST = DEVICE_LIST.map((device) => ({
  id: device.id,
  label: device.label,
  dashboardType: device.dashboardType,
  dashboardIcon: device.dashboardIcon,
  actionIcon: device.actionIcon,
}));

const DEVICE_ALIAS_MAP = {};
DEVICE_LIST.forEach((device) => {
  DEVICE_ALIAS_MAP[device.id] = device.id;
  DEVICE_ALIAS_MAP[device.label.toLowerCase()] = device.id;

  device.aliases.forEach((alias) => {
    DEVICE_ALIAS_MAP[String(alias || '').toLowerCase()] = device.id;
  });
});

function normalizeDeviceId(value) {
  const key = String(value || '').trim().toLowerCase();
  if (!key || key === 'all') return '';
  return DEVICE_ALIAS_MAP[key] || '';
}

module.exports = {
  DEVICE_LIST,
  DEVICE_IDS,
  DEVICE_LABEL_MAP,
  PUBLIC_DEVICE_LIST,
  normalizeDeviceId,
};