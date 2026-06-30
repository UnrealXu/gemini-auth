import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { getActiveToken, setActiveToken } from './keyring.js';

const REGISTRY_DIR = path.join(os.homedir(), '.gemini-auth');
const REGISTRY_FILE = path.join(REGISTRY_DIR, 'registry.json');
export const PROFILES_DIR = path.join(os.homedir(), 'AppData', 'Roaming', 'Antigravity_Profiles');
export const DEFAULT_APPDATA_DIR = path.join(os.homedir(), 'AppData', 'Roaming', 'Antigravity');

const DEFAULT_REGISTRY = {
  schema_version: 1,
  active_profile: null,
  profiles: []
};

export async function ensureDir(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
}

export async function loadRegistry() {
  await ensureDir(REGISTRY_DIR);
  try {
    const data = await fs.readFile(REGISTRY_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      await saveRegistry(DEFAULT_REGISTRY);
      return { ...DEFAULT_REGISTRY };
    }
    throw err;
  }
}

export async function saveRegistry(registry) {
  await ensureDir(REGISTRY_DIR);
  await fs.writeFile(REGISTRY_FILE, JSON.stringify(registry, null, 2), 'utf8');
}

export async function getProfiles() {
  const registry = await loadRegistry();
  return registry.profiles || [];
}

export async function getActiveProfileName() {
  const registry = await loadRegistry();
  return registry.active_profile;
}

export async function addProfile(name, alias, email) {
  const registry = await loadRegistry();
  const profileName = name.trim().toLowerCase();
  
  if (registry.profiles.some(p => p.name === profileName)) {
    throw new Error(`Profile "${name}" already exists.`);
  }

  const profilePath = path.join(PROFILES_DIR, profileName);
  const newProfile = {
    name: profileName,
    alias: alias || name,
    email: email || '',
    path: profilePath,
    created_at: Date.now(),
    last_used_at: null,
    quota: null
  };

  // If importing current active session, also copy the credential token from keyring
  const activeToken = getActiveToken();
  if (activeToken) {
    await ensureDir(profilePath);
    await fs.writeFile(path.join(profilePath, 'token.json'), JSON.stringify(activeToken, null, 2), 'utf8');
  }

  registry.profiles.push(newProfile);
  await saveRegistry(registry);
  return newProfile;
}

export async function removeProfileFromRegistry(name) {
  const registry = await loadRegistry();
  const profileName = name.trim().toLowerCase();
  const index = registry.profiles.findIndex(p => p.name === profileName);
  
  if (index === -1) {
    throw new Error(`Profile "${name}" does not exist.`);
  }

  const profile = registry.profiles[index];
  registry.profiles.splice(index, 1);

  if (registry.active_profile === profileName) {
    registry.active_profile = null;
  }

  await saveRegistry(registry);
  return profile;
}

export async function updateActiveProfile(name) {
  const registry = await loadRegistry();
  const oldActiveName = registry.active_profile;
  const profileName = name ? name.trim().toLowerCase() : null;
  
  if (profileName && !registry.profiles.some(p => p.name === profileName)) {
    throw new Error(`Profile "${name}" does not exist in registry.`);
  }

  // 1. Save current active token from keyring to old active profile's folder
  if (oldActiveName) {
    const oldProfile = registry.profiles.find(p => p.name === oldActiveName);
    if (oldProfile) {
      const activeToken = getActiveToken();
      if (activeToken) {
        try {
          await ensureDir(oldProfile.path);
          await fs.writeFile(path.join(oldProfile.path, 'token.json'), JSON.stringify(activeToken, null, 2), 'utf8');
        } catch (err) {
          // Ignore write error
        }
      }
    }
  }

  // 2. Set new active profile in registry
  registry.active_profile = profileName;
  if (profileName) {
    const profile = registry.profiles.find(p => p.name === profileName);
    if (profile) {
      profile.last_used_at = Date.now();
      
      // 3. Restore token from new active profile folder to keyring
      try {
        const tokenPath = path.join(profile.path, 'token.json');
        const tokenData = await fs.readFile(tokenPath, 'utf8');
        const tokenObj = JSON.parse(tokenData);
        setActiveToken(tokenObj);
      } catch (err) {
        // Token file might not exist yet, that's fine
      }
    }
  }
  
  await saveRegistry(registry);
}
