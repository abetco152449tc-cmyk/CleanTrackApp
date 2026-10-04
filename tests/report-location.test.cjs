const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const point = {
  coords: {
    latitude: 7.4,
    longitude: 125.8,
    accuracy: 15,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
  },
  timestamp: 12345,
};
function load(file, modules, extra = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require: (name) => {
      if (!(name in modules)) throw Error(`Unexpected module: ${name}`);
      return modules[name];
    },
    setTimeout,
    clearTimeout,
    ...extra,
  });
  return exports;
}
function setup({
  os = 'android',
  native = true,
  location = {},
  android = {},
  browser,
  secure = true,
  expire = false,
} = {}) {
  const calls = [];
  const app = load(
    'src/lib/report-location.ts',
    {
      'react-native': { Platform: { OS: os } },
      './android-location': {
        hasAndroidLocationProvider: () => native,
        getAndroidLocation: async (precise) => {
          calls.push(['android', precise]);
          return point;
        },
        ...android,
      },
      'expo-location': {
        Accuracy: { High: 4 },
        requestForegroundPermissionsAsync: async () => ({
          granted: true,
          android: { accuracy: 'fine' },
        }),
        hasServicesEnabledAsync: async () => true,
        getCurrentPositionAsync: async () => {
          calls.push(['expo']);
          return point;
        },
        reverseGeocodeAsync: async () => [{ street: 'Main Street', city: 'Tagum' }],
        ...location,
      },
    },
    {
      navigator: browser ?? { geolocation: { getCurrentPosition: (resolve) => resolve(point) } },
      isSecureContext: secure,
      ...(expire
        ? {
            setTimeout: (fn) => {
              queueMicrotask(fn);
              return 1;
            },
            clearTimeout: () => {},
          }
        : {}),
    },
  );
  return { ...app, calls };
}

test('Huawei uses direct Android GPS without calling Google location APIs', async () => {
  const app = setup({
    location: {
      getCurrentPositionAsync: async () => {
        throw Error('SERVICE_INVALID');
      },
    },
  });
  assert.equal((await app.getReportLocation()).coords.latitude, 7.4);
  assert.deepEqual(app.calls, [['android', true]]);
});
test('approximate Android permission uses the network provider', async () => {
  const app = setup({
    location: {
      requestForegroundPermissionsAsync: async () => ({
        granted: true,
        android: { accuracy: 'coarse' },
      }),
    },
  });
  await app.getReportLocation();
  assert.deepEqual(app.calls, [['android', false]]);
});
test('denied permission never requests location', async () => {
  const app = setup({
    location: { requestForegroundPermissionsAsync: async () => ({ granted: false }) },
  });
  await assert.rejects(app.getReportLocation(), (e) => e.settings === 'permission');
  assert.equal(app.calls.length, 0);
});
test('disabled device services show phone settings without invoking Google prompts', async () => {
  const app = setup({ location: { hasServicesEnabledAsync: async () => false } });
  await assert.rejects(app.getReportLocation(), (e) => e.settings === 'location');
  assert.equal(app.calls.length, 0);
});
test('Expo Go still uses its bundled location provider on supported Android devices', async () => {
  const app = setup({ native: false });
  await app.getReportLocation();
  assert.deepEqual(app.calls, [['expo']]);
});
test('Huawei in Expo Go explains that a newly built APK is required', async () => {
  const app = setup({
    native: false,
    location: {
      getCurrentPositionAsync: async () => {
        throw Error('LocationServices.API is not available: SERVICE_INVALID');
      },
    },
  });
  await assert.rejects(
    app.getReportLocation(),
    (e) => e.settings === null && /newly built CleanTrack APK/.test(e.message),
  );
});
test('iPhone uses Expo Core Location and never loads Android provider', async () => {
  const app = setup({ os: 'ios' });
  await app.getReportLocation();
  assert.deepEqual(app.calls, [['expo']]);
});
test('browser uses browser geolocation without native permission APIs', async () => {
  const app = setup({
    os: 'web',
    location: {
      requestForegroundPermissionsAsync: async () => {
        throw Error('Native call');
      },
    },
  });
  assert.equal((await app.getReportLocation()).coords.latitude, 7.4);
  assert.equal(app.calls.length, 0);
});
test('browser permission denial remains actionable', async () => {
  const app = setup({
    os: 'web',
    browser: { geolocation: { getCurrentPosition: (_ok, fail) => fail({ code: 1 }) } },
  });
  await assert.rejects(app.getReportLocation(), (e) => e.settings === 'permission');
});
test('insecure browser context explains HTTPS requirement', async () => {
  const app = setup({ os: 'web', secure: false });
  await assert.rejects(app.getReportLocation(), /requires HTTPS/);
});
test('unsupported browser has an explicit fallback', async () => {
  const app = setup({ os: 'web', browser: {} });
  await assert.rejects(app.getReportLocation(), /browser cannot provide location/);
});
test('stalled native requests release the report form', async () => {
  const app = setup({ android: { getAndroidLocation: () => new Promise(() => {}) }, expire: true });
  await assert.rejects(app.getReportLocation(), /too long/);
});
test('reverse geocoding returns a readable address when available', async () => {
  assert.equal(await setup().getReportAddress(point.coords), 'Main Street, Tagum');
});
test('missing address service preserves GPS coordinates', async () => {
  const app = setup({
    location: {
      reverseGeocodeAsync: async () => {
        throw Error('service unavailable');
      },
    },
  });
  assert.equal(await app.getReportAddress(point.coords), '7.400000, 125.800000');
});
test('stalled geocoding does not prevent submission of valid coordinates', async () => {
  const app = setup({
    location: { reverseGeocodeAsync: () => new Promise(() => {}) },
    expire: true,
  });
  assert.equal(await app.getReportAddress(point.coords), '7.400000, 125.800000');
});

function nativeSetup(failCode) {
  const calls = [];
  const app = load('src/lib/android-location.ts', {
    'react-native': { TurboModuleRegistry: { get: () => ({}) } },
    '@react-native-community/geolocation': {
      __esModule: true,
      default: {
        setRNConfiguration: (config) => calls.push(config),
        getCurrentPosition: async (success, fail, options) => {
          calls.push(options);
          if (failCode && options.enableHighAccuracy) fail({ code: failCode });
          else success(point);
        },
      },
    },
  });
  return { ...app, calls };
}
test('native provider explicitly selects Android and disallows stale cached coordinates', async () => {
  const app = nativeSetup();
  await app.getAndroidLocation(true);
  assert.equal(app.calls[0].locationProvider, 'android');
  assert.equal(app.calls[0].skipPermissionRequests, true);
  assert.equal(app.calls[1].maximumAge, 0);
  assert.equal(app.calls[1].enableHighAccuracy, true);
});
test('GPS timeout retries with device network location', async () => {
  const app = nativeSetup(3);
  await app.getAndroidLocation(true);
  assert.equal(app.calls[2].enableHighAccuracy, false);
  assert.equal(app.calls[2].timeout, 12000);
});
test('permission errors in native callback are never retried', async () => {
  const app = nativeSetup(1);
  await assert.rejects(app.getAndroidLocation(true), (e) => e.code === 1);
  assert.equal(app.calls.length, 2);
});
