// Owner-only Firebase REST access. No Google tokens or server credentials enter the app.
process.env.DEBUG = '';
const { getGlobalDefaultAccount } = require('firebase-tools/lib/auth');
const { requireAuth } = require('firebase-tools/lib/requireAuth');
const { Client } = require('firebase-tools/lib/apiv2');
const project = 'cleantrack-e62a9';

function encode(value) {
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number')
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  return {
    mapValue: {
      fields: Object.fromEntries(
        Object.entries(value)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, encode(v)]),
      ),
    },
  };
}
function decode(value) {
  if ('stringValue' in value) return value.stringValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(decode);
  if ('mapValue' in value)
    return Object.fromEntries(
      Object.entries(value.mapValue.fields ?? {}).map(([k, v]) => [k, decode(v)]),
    );
  return null;
}
const record = (document) => ({
  id: document.name.split('/').at(-1),
  name: document.name,
  version: document.updateTime,
  data: Object.fromEntries(Object.entries(document.fields ?? {}).map(([k, v]) => [k, decode(v)])),
});
const status = (error) => error.status ?? error.context?.response?.statusCode;
const conflict = (error) =>
  [409, 412].includes(status(error)) ||
  ['FAILED_PRECONDITION', 'ABORTED'].includes(error.context?.body?.error?.status);

async function createRepository({ client: injectedClient, projectId = project } = {}) {
  if (!injectedClient) {
    const account = getGlobalDefaultAccount();
    if (!account) throw Error('Run npm run firebase:login with the project owner account first.');
    await requireAuth({
      project,
      user: account.user,
      tokens: account.tokens,
      nonInteractive: true,
    });
  }
  const client =
    injectedClient ?? new Client({ urlPrefix: 'https://firestore.googleapis.com', auth: true });
  const selectedProject = injectedClient ? projectId : project;
  const root = `/v1/projects/${selectedProject}/databases/(default)/documents`;
  async function get(path) {
    try {
      return record((await client.get(`${root}/${path}`)).body);
    } catch (error) {
      if (status(error) === 404) return null;
      throw error;
    }
  }
  async function list(path, pageToken) {
    const response = (
      await client.get(`${root}/${path}`, {
        queryParams: { pageSize: 100, orderBy: '__name__', ...(pageToken ? { pageToken } : {}) },
      })
    ).body;
    return { records: (response.documents ?? []).map(record), next: response.nextPageToken };
  }
  async function all(path) {
    const records = [];
    let pageToken;
    do {
      const page = await list(path, pageToken);
      records.push(...page.records);
      pageToken = page.next;
    } while (pageToken);
    return records;
  }
  return {
    project: selectedProject,
    getReport: (id) => get(`reports/${encodeURIComponent(id)}`),
    getPerson: async (uid) => (await get(`users/${encodeURIComponent(uid)}`))?.data,
    getDevice: (uid, id) =>
      get(`users/${encodeURIComponent(uid)}/devices/${encodeURIComponent(id)}`),
    listDevices: (uid) => all(`users/${encodeURIComponent(uid)}/devices`),
    listReports: (cursor) => list('reports', cursor),
    async listDueJobs(now) {
      const response = await client.post(`${root}:runQuery`, {
        structuredQuery: {
          from: [{ collectionId: 'notifications', allDescendants: true }],
          where: {
            compositeFilter: {
              op: 'AND',
              filters: [
                {
                  fieldFilter: {
                    field: { fieldPath: 'state' },
                    op: 'IN',
                    value: encode(['queued', 'sending', 'receipts']),
                  },
                },
                {
                  fieldFilter: {
                    field: { fieldPath: 'nextAttemptAt' },
                    op: 'LESS_THAN_OR_EQUAL',
                    value: encode(now),
                  },
                },
              ],
            },
          },
          orderBy: [{ field: { fieldPath: 'nextAttemptAt' }, direction: 'ASCENDING' }],
          limit: 100,
        },
      });
      return (Array.isArray(response.body) ? response.body : [])
        .filter((entry) => entry.document)
        .map((entry) => record(entry.document));
    },
    async saveJob(job, data) {
      // Firestore timestamps remain timestamps after reading a job through REST.
      const normalized = {
        ...data,
        createdAt: new Date(data.createdAt),
        nextAttemptAt: new Date(data.nextAttemptAt),
      };
      const fields = encode(normalized).mapValue.fields;
      try {
        const response = await client.patch(
          `/v1/${job.name}`,
          { fields },
          { queryParams: { 'currentDocument.updateTime': job.version } },
        );
        return record(response.body);
      } catch (error) {
        if (conflict(error)) return null;
        throw error;
      }
    },
    async removeDeviceIfTokenMatches(uid, id, token) {
      const current = await get(
        `users/${encodeURIComponent(uid)}/devices/${encodeURIComponent(id)}`,
      );
      if (current?.data.token === token) {
        try {
          await client.delete(`/v1/${current.name}`, {
            queryParams: { 'currentDocument.updateTime': current.version },
          });
        } catch (error) {
          if (status(error) !== 404 && !conflict(error)) throw error;
        }
      }
    },
    async expirePhotos(report, date) {
      await client.post(`${root}:commit`, {
        writes: [
          {
            update: { name: report.name, fields: { photosExpiredAt: { stringValue: date } } },
            updateMask: { fieldPaths: ['photosExpiredAt'] },
            currentDocument: { updateTime: report.version },
          },
          { delete: `${report.name}/evidence/main` },
          { delete: `${report.name}/evidence/completion` },
        ],
      });
    },
  };
}
module.exports = { createRepository, encode, decode };
