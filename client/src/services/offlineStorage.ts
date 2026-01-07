import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { Job, Location, MapLocation } from '../types';

interface EGoliLinkDB extends DBSchema {
  jobs: {
    key: string;
    value: {
      id: string;
      data: Job;
      lastSynced: Date;
    };
    indexes: { 'by-status': string };
  };
  locations: {
    key: string;
    value: {
      id: string;
      data: Location | MapLocation;
      lastSynced: Date;
    };
    indexes: { 'by-township': string };
  };
  pendingUploads: {
    key: string;
    value: {
      id: string;
      type: 'photo' | 'status_update';
      jobId: string;
      payload: unknown;
      createdAt: Date;
      retryCount: number;
    };
    indexes: { 'by-type': string; 'by-jobId': string };
  };
  syncQueue: {
    key: string;
    value: {
      id: string;
      action: 'create' | 'update' | 'delete';
      entity: 'job' | 'photo' | 'status';
      data: unknown;
      createdAt: Date;
      retryCount: number;
    };
    indexes: { 'by-entity': string };
  };
}

const DB_NAME = 'egoli-link-db';
const DB_VERSION = 1;

let db: IDBPDatabase<EGoliLinkDB> | null = null;

export async function initDB(): Promise<IDBPDatabase<EGoliLinkDB>> {
  if (db) return db;

  db = await openDB<EGoliLinkDB>(DB_NAME, DB_VERSION, {
    upgrade(database) {
      // Jobs store
      if (!database.objectStoreNames.contains('jobs')) {
        const jobsStore = database.createObjectStore('jobs', { keyPath: 'id' });
        jobsStore.createIndex('by-status', 'data.status');
      }

      // Locations store
      if (!database.objectStoreNames.contains('locations')) {
        const locationsStore = database.createObjectStore('locations', { keyPath: 'id' });
        locationsStore.createIndex('by-township', 'data.township');
      }

      // Pending uploads store
      if (!database.objectStoreNames.contains('pendingUploads')) {
        const uploadsStore = database.createObjectStore('pendingUploads', { keyPath: 'id' });
        uploadsStore.createIndex('by-type', 'type');
        uploadsStore.createIndex('by-jobId', 'jobId');
      }

      // Sync queue store
      if (!database.objectStoreNames.contains('syncQueue')) {
        const syncStore = database.createObjectStore('syncQueue', { keyPath: 'id' });
        syncStore.createIndex('by-entity', 'entity');
      }
    },
  });

  return db;
}

// Jobs operations
export async function saveJob(job: Job): Promise<void> {
  const database = await initDB();
  await database.put('jobs', {
    id: job.id,
    data: job,
    lastSynced: new Date(),
  });
}

export async function saveJobs(jobs: Job[]): Promise<void> {
  const database = await initDB();
  const tx = database.transaction('jobs', 'readwrite');
  await Promise.all([
    ...jobs.map((job) => tx.store.put({
      id: job.id,
      data: job,
      lastSynced: new Date(),
    })),
    tx.done,
  ]);
}

export async function getJob(id: string): Promise<Job | undefined> {
  const database = await initDB();
  const result = await database.get('jobs', id);
  return result?.data;
}

export async function getAllJobs(): Promise<Job[]> {
  const database = await initDB();
  const results = await database.getAll('jobs');
  return results.map((r) => r.data);
}

export async function getJobsByStatus(status: string): Promise<Job[]> {
  const database = await initDB();
  const results = await database.getAllFromIndex('jobs', 'by-status', status);
  return results.map((r) => r.data);
}

export async function deleteJob(id: string): Promise<void> {
  const database = await initDB();
  await database.delete('jobs', id);
}

// Locations operations
export async function saveLocation(location: Location | MapLocation): Promise<void> {
  const database = await initDB();
  await database.put('locations', {
    id: location.id,
    data: location,
    lastSynced: new Date(),
  });
}

export async function saveLocations(locations: (Location | MapLocation)[]): Promise<void> {
  const database = await initDB();
  const tx = database.transaction('locations', 'readwrite');
  await Promise.all([
    ...locations.map((loc) => tx.store.put({
      id: loc.id,
      data: loc,
      lastSynced: new Date(),
    })),
    tx.done,
  ]);
}

export async function getLocation(id: string): Promise<Location | MapLocation | undefined> {
  const database = await initDB();
  const result = await database.get('locations', id);
  return result?.data;
}

export async function getAllLocations(): Promise<(Location | MapLocation)[]> {
  const database = await initDB();
  const results = await database.getAll('locations');
  return results.map((r) => r.data);
}

// Pending uploads operations
export async function addPendingUpload(
  type: 'photo' | 'status_update',
  jobId: string,
  payload: unknown
): Promise<string> {
  const database = await initDB();
  const id = crypto.randomUUID();
  await database.add('pendingUploads', {
    id,
    type,
    jobId,
    payload,
    createdAt: new Date(),
    retryCount: 0,
  });
  return id;
}

export async function getPendingUploads(): Promise<Array<{
  id: string;
  type: 'photo' | 'status_update';
  jobId: string;
  payload: unknown;
  createdAt: Date;
  retryCount: number;
}>> {
  const database = await initDB();
  return database.getAll('pendingUploads');
}

export async function getPendingUploadsByJob(jobId: string): Promise<Array<{
  id: string;
  type: 'photo' | 'status_update';
  jobId: string;
  payload: unknown;
}>> {
  const database = await initDB();
  const results = await database.getAllFromIndex('pendingUploads', 'by-jobId', jobId);
  return results;
}

export async function removePendingUpload(id: string): Promise<void> {
  const database = await initDB();
  await database.delete('pendingUploads', id);
}

export async function incrementRetryCount(id: string): Promise<void> {
  const database = await initDB();
  const item = await database.get('pendingUploads', id);
  if (item) {
    item.retryCount++;
    await database.put('pendingUploads', item);
  }
}

// Sync queue operations
export async function addToSyncQueue(
  action: 'create' | 'update' | 'delete',
  entity: 'job' | 'photo' | 'status',
  data: unknown
): Promise<string> {
  const database = await initDB();
  const id = crypto.randomUUID();
  await database.add('syncQueue', {
    id,
    action,
    entity,
    data,
    createdAt: new Date(),
    retryCount: 0,
  });
  return id;
}

export async function getSyncQueue(): Promise<Array<{
  id: string;
  action: 'create' | 'update' | 'delete';
  entity: 'job' | 'photo' | 'status';
  data: unknown;
  createdAt: Date;
  retryCount: number;
}>> {
  const database = await initDB();
  return database.getAll('syncQueue');
}

export async function removeFromSyncQueue(id: string): Promise<void> {
  const database = await initDB();
  await database.delete('syncQueue', id);
}

// Clear all data
export async function clearAllData(): Promise<void> {
  const database = await initDB();
  await Promise.all([
    database.clear('jobs'),
    database.clear('locations'),
    database.clear('pendingUploads'),
    database.clear('syncQueue'),
  ]);
}

// Get offline status info
export async function getOfflineStatus(): Promise<{
  jobCount: number;
  locationCount: number;
  pendingUploads: number;
  syncQueueSize: number;
}> {
  const database = await initDB();
  const [jobCount, locationCount, pendingUploads, syncQueueSize] = await Promise.all([
    database.count('jobs'),
    database.count('locations'),
    database.count('pendingUploads'),
    database.count('syncQueue'),
  ]);

  return { jobCount, locationCount, pendingUploads, syncQueueSize };
}
