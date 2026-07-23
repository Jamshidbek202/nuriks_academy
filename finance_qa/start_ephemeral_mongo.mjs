import { MongoMemoryReplSet } from '../frontend/node_modules/mongodb-memory-server/index.js';

const replSet = await MongoMemoryReplSet.create({
  binary: { version: process.env.FINANCE_QA_MONGO_VERSION || '7.0.14' },
  replSet: {
    count: 1,
    name: 'rs0',
    storageEngine: 'wiredTiger',
  },
});

process.stdout.write(`FINANCE_QA_MONGO_URL=${replSet.getUri()}\n`);

let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  await replSet.stop();
  process.exit(0);
};

process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
await new Promise(() => {});
