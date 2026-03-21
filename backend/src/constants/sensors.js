const SENSOR_LIST = [
  {
    key: 'temperature',
    name: 'Temperature',
    unit: '°C',
    aliases: ['temp', 'temperature'],
  },
  {
    key: 'humidity',
    name: 'Humidity',
    unit: '%',
    aliases: ['humid', 'humidity'],
  },
  {
    key: 'light',
    name: 'Light Sensor',
    unit: 'Lux',
    aliases: ['light', 'light sensor', 'lux'],
  },
];

const DASHBOARD_SENSOR_KEYS = ['temperature', 'humidity', 'light'];
const SENSOR_KEY_MAP = Object.fromEntries(SENSOR_LIST.map((sensor) => [sensor.key, sensor]));
const SENSOR_NAME_MAP = Object.fromEntries(SENSOR_LIST.map((sensor) => [sensor.key, sensor.name]));
const SENSOR_UNIT_MAP = Object.fromEntries(SENSOR_LIST.map((sensor) => [sensor.key, sensor.unit]));

const SENSOR_ALIAS_MAP = {};
SENSOR_LIST.forEach((sensor) => {
  SENSOR_ALIAS_MAP[sensor.key] = sensor.key;
  SENSOR_ALIAS_MAP[sensor.name.toLowerCase()] = sensor.key;

  sensor.aliases.forEach((alias) => {
    SENSOR_ALIAS_MAP[String(alias || '').toLowerCase()] = sensor.key;
  });
});

function normalizeSensorKey(value) {
  const key = String(value || '').trim().toLowerCase();
  if (!key || key === 'all') return '';
  return SENSOR_ALIAS_MAP[key] || '';
}

function getSensorDefinitionByKey(key) {
  return SENSOR_KEY_MAP[String(key || '').toLowerCase()] || null;
}

function getSensorDefinitionByName(name) {
  const normalizedKey = normalizeSensorKey(name);
  if (!normalizedKey) return null;
  return getSensorDefinitionByKey(normalizedKey);
}

function getLegacySensorKeys(value) {
  const definition = getSensorDefinitionByName(value);
  if (!definition) return [];

  return Array.from(new Set([
    definition.key,
    ...definition.aliases.map((alias) => String(alias || '').toLowerCase()),
  ]));
}

module.exports = {
  SENSOR_LIST,
  DASHBOARD_SENSOR_KEYS,
  SENSOR_NAME_MAP,
  SENSOR_UNIT_MAP,
  normalizeSensorKey,
  getSensorDefinitionByKey,
  getSensorDefinitionByName,
  getLegacySensorKeys,
};
