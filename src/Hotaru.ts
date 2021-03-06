import axios from 'axios';
import { isAlphanumeric } from 'validator';
import freshId from 'fresh-id';
import { parse, stringify } from 'date-aware-json';

import { HotaruUser, UserChange } from './HotaruUser';
import { HotaruError } from './HotaruError';
import { Query } from './Query';


const INSTALLATION_ID_KEY = 'com.primlo.hotaru.installationId';
const SESSION_ID_KEY = 'com.primlo.hotaru.sessionId';
const USER_DATA_KEY = 'com.primlo.hotaru.userData';
const USER_CHANGELOG_KEY = 'com.primlo.hotaru.userChangelog';


/**
 * Storage interface compatible with LocalStorage and React Native's AsyncStorage.
 */
export interface Storage {
  getItem: (key: string) => Promise<any>;
  setItem: (key: string, value: any) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}

/**
 * The default storage engine that doesn't persist anything between restarts.
 */
class EphemeralStorage implements Storage {
  private data = {} as any;

  async getItem(key: string): Promise<any> {
    return this.data[key];
  }

  async setItem(key: string, value: any): Promise<void> {
    this.data[key] = value;
  }

  async removeItem(key: string): Promise<void> {
    delete this.data[key];
  }
}

/**
 * This class wraps the Storage interface so that we can get and set objects directly.
 */
class StorageController {
  private storage: Storage;

  constructor(storage: Storage | undefined) {
    if (storage) {
      this.storage = storage;
    } else {
      this.storage = new EphemeralStorage();
    }
  }

  public async getPrimitive(key: string): Promise<any> {
    return this.storage.getItem(key);
  }

  public async setPrimitive(key: string, value: boolean | number | string): Promise<void> {
    return this.storage.setItem(key, value);
  }

  public async getObject(key: string): Promise<any> {
    const json = await this.storage.getItem(key);

    if (json != null) {
      return parse(json);
    } else {
      return null;
    }
  }

  public async setObject(key: string, value: any): Promise<void> {
    const json = stringify(value);
    return this.storage.setItem(key, json);
  }

  public async removeItem(key: string): Promise<void> {
    return this.storage.removeItem(key);
  }
}

export type RequestFunction = (url: string, params: any) => Promise<any>;

export interface InitializationParameters {
  serverUrl: string;
  privateMode?: boolean;
  overrideSSLRequirement?: boolean;
  storage?: Storage;
  masterKey?: string;
  requestFunction?: RequestFunction;
}

const defaultRequestFunction = async (url: string, params: any): Promise<any> => {
  const serverResponse = await axios.post(url, { payloadString: stringify(params) });
  const data = parse(serverResponse.data.payloadString);

  if (data.status !== 'ok') {
    if (data.code && data.code >= 500) {
      throw new HotaruError(data.code);
    }
    const error = new Error(data.message);
    throw error;
  }

  return data.result;
}


/**
 * The main object. Hotaru is a singleton that should not be cloned.
 */
export namespace Hotaru {
  let hasBeenInitialized = false;
  let masterKey_: string | null;
  let storageController: StorageController;
  let serverUrl_: string;
  let privateMode_: boolean;
  let requestFunction_: RequestFunction;

  let sessionId: string | null;
  let userData: { [key: string]: any } | null;
  let userChangelog: UserChange[] | null;

  let installationId_: string;

  export const initialize = async ({ serverUrl, privateMode = false, overrideSSLRequirement = false, storage, masterKey, requestFunction = defaultRequestFunction }: InitializationParameters) => {
    if (hasBeenInitialized) {
      throw new HotaruError(HotaruError.ALREADY_INITIALIZED);
    }

    storageController = new StorageController(storage);
    if (storage !== undefined && storageController.getPrimitive(INSTALLATION_ID_KEY)) {
      await storageController.setPrimitive(INSTALLATION_ID_KEY, freshId());
    }

    if (!serverUrl.startsWith('https://') && !overrideSSLRequirement) {
      throw new HotaruError(HotaruError.SSL_REQUIRED);
    }

    if (!serverUrl.endsWith('/')) {
      serverUrl_ = `${serverUrl}/`;
    } else {
      serverUrl_ = serverUrl;
    }

    privateMode_ = privateMode;
    masterKey_ = masterKey || null;
    requestFunction_ = requestFunction;

    await loadData();

    hasBeenInitialized = true;
  }

  export const getInstallationId = async (): Promise<string> => {
    return await storageController.getPrimitive(INSTALLATION_ID_KEY);
  }

  const makeRequest = async (endpoint: string, params: any): Promise<any> => {
    const paramsAndOtherStuff = Object.assign({}, params, {
      installationId: await getInstallationId(),
      masterKey: masterKey_ || null,
      // SDK version
      // OS (name/version)
    });

    return requestFunction_(serverUrl_ + endpoint, paramsAndOtherStuff);
  }

  const loadData = async (): Promise<void> => {
    userData = await storageController.getObject(USER_DATA_KEY);
    userChangelog = await storageController.getObject(USER_CHANGELOG_KEY);
    sessionId = await storageController.getPrimitive(SESSION_ID_KEY);
  }

  const clearUserDataAndSession = async (): Promise<void> => {
    await storageController.removeItem(SESSION_ID_KEY);
    await storageController.removeItem(USER_DATA_KEY);
    await storageController.removeItem(USER_CHANGELOG_KEY);
    sessionId = null;
    userData = null;
    userChangelog = null;
  }

  const saveSessionIdToDisk = async (): Promise<void> => {
    if (sessionId) {
      return storageController.setPrimitive(SESSION_ID_KEY, sessionId);
    } else {
      return storageController.removeItem(SESSION_ID_KEY);
    }
  }

  const saveUserToDisk = async (): Promise<void> => {
    await storageController.setObject(USER_DATA_KEY, userData);
    await storageController.setObject(USER_CHANGELOG_KEY, userChangelog);
  }

  const ensureInitialization = (): void => {
    if (!hasBeenInitialized) {
      throw new HotaruError(HotaruError.UNINITIALIZED);
    }
  }

  // TODO what happens if we log in, get a user, then log out. the user object will point to nothing
  export const currentUser = (): HotaruUser | null => {
    ensureInitialization();

    if (userData === null || userChangelog === null || sessionId === null) {
      return null;
    }

    const user = new HotaruUser({
      get: (field) => userData ? userData[field] : null,
      set: (field, value) => { userData && (userData[field] = value); },
      appendChange: (change) => {
        if (!userChangelog) return;

        if (change.type === 'set') {
          userChangelog = userChangelog.filter(c => c.field !== change.field);
        }
        userChangelog.push(change);
      },
      // The user doesn't need access to these
      getRawData: () => null,
      getChangelog: () => null,
    });
    Object.seal(user);
    return user;
  }


  export const logInAsGuest = async (): Promise<void> => {
    ensureInitialization();

    if (userData !== null || userChangelog !== null) {
      throw new HotaruError(HotaruError.STILL_LOGGED_IN);
    }

    const result = await makeRequest('_logInAsGuest', {});

    sessionId = result.sessionId;
    userData = result.userData;
    userChangelog = [];

    await saveSessionIdToDisk();
    await saveUserToDisk();
  }

  export const signUp = async (email: string, password: string): Promise<void> => {
    ensureInitialization();

    if (userData !== null || userChangelog !== null) {
      throw new HotaruError(HotaruError.STILL_LOGGED_IN);
    }

    const result = await makeRequest('_signUp', { email, password });

    sessionId = result.sessionId;
    userData = result.userData;
    userChangelog = [];

    await saveSessionIdToDisk();
    await saveUserToDisk();
  }

  export const convertGuestUser = async (email: string, password: string): Promise<void> => {
    ensureInitialization();

    await synchronizeUser();

    const result = await makeRequest('_convertGuestUser', { sessionId: sessionId, email, password });

    userData = result.userData;

    await saveUserToDisk();
  }

  export const logIn = async (email: string, password: string): Promise<void> => {
    ensureInitialization();

    if (userData !== null || userChangelog !== null) {
      throw new HotaruError(HotaruError.STILL_LOGGED_IN);
    }

    const result = await makeRequest('_logIn', { email, password });

    sessionId = result.sessionId;
    userData = result.userData;
    userChangelog = [];

    await saveSessionIdToDisk();
    await saveUserToDisk();
  }

  export const logOut = async (): Promise<void> => {
    ensureInitialization();

    await synchronizeUser();
    await makeRequest('_logOut', { sessionId: sessionId });

    await clearUserDataAndSession();
  }

  export const forceLogOut = async (): Promise<void> => {
    ensureInitialization();
    clearUserDataAndSession();
  }

  export const runQuery = async (query: Query): Promise<any[]> => {
    if (!masterKey_) {
      throw new HotaruError(HotaruError.MASTER_KEY_REQUIRED);
    }

    const response = await makeRequest('_runQuery', { masterKey: masterKey_, queryData: query.serialize() });
    return response.queryResult;
  }

  export const synchronizeUser = async (): Promise<void> => {
    ensureInitialization();

    if (!userChangelog) return;

    const result = await makeRequest('_synchronizeUser', {
      sessionId: sessionId,
      clientChangelog: userChangelog,
    });

    userData = result.userData;

    const processedChanges = result.processedChanges;
    userChangelog = userChangelog.filter(c => !processedChanges.includes(c._id));

    await saveUserToDisk();
  }

  export const run = async (funcName: string, params: any): Promise<any> => {
    ensureInitialization();

    if (!isAlphanumeric(funcName)) {
      throw new HotaruError(HotaruError.NON_ALPHANUMERIC_FUNCTION_NAME);
    }

    const result = await makeRequest(funcName, { sessionId: sessionId, params });
    return result;
  }
};
