import { createContext } from 'react';
export type Role = 'Resident' | 'Collector' | 'Admin';
export type Status =
  'Submitted' | 'Under Review' | 'Assigned' | 'In Progress' | 'Resolved' | 'Rejected';
export type Person = { id: string; name: string; email: string; phone: string; role: Role };
export type Report = {
  id: string;
  title: string;
  type: string;
  description: string;
  address: string;
  photo?: string;
  hasPhoto?: boolean;
  latitude?: number;
  longitude?: number;
  locationAccuracy?: number;
  locationSource?: 'gps' | 'map' | 'address';
  completionPhoto?: string;
  hasCompletionPhoto?: boolean;
  photosExpiredAt?: string;
  resident: string;
  residentName?: string;
  collector?: string;
  collectorName?: string;
  status: Status;
  created: string;
  revision?: number;
  history: { status: Status; date: string; note: string; actor?: string; collector?: string }[];
};
export type Store = {
  users: Person[];
  reports: Report[];
  ready: boolean;
  error: string;
  user?: Person;
  readRevisions?: Record<string, number>;
  login: (id: string) => void;
  logout: () => void | Promise<void>;
  saveUser: (person: Person) => void | Promise<void>;
  promoteCollector?: (id: string) => Promise<void>;
  markRead?: (reports: Report[]) => Promise<void>;
  hasMoreReports?: boolean;
  loadingMoreReports?: boolean;
  paginationError?: string;
  loadMoreReports?: () => Promise<void>;
  loadReport?: (id: string) => Promise<void>;
  releaseReport?: (id: string) => void;
  addReport: (report: Report) => void | Promise<void>;
  updateReport: (
    id: string,
    status: Status,
    note: string,
    collector?: string,
    completionPhoto?: string,
  ) => void | Promise<void>;
};
export const StoreContext = createContext<Store | null>(null);
