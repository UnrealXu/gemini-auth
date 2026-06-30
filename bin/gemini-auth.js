#!/usr/bin/env node

import path from 'node:path';
import fs from 'node:fs/promises';
import { exec } from 'node:child_process';
import { 
  loadRegistry, 
  saveRegistry, 
  getProfiles, 
  getActiveProfileName, 
  addProfile, 
  removeProfileFromRegistry, 
  updateActiveProfile,
  DEFAULT_APPDATA_DIR,
  PROFILES_DIR,
  ensureDir
} from '../lib/registry.js';
import { 
  prompt, 
  promptConfirm, 
  closePrompt,
  isAppRunning, 
  killApp, 
  getDirSize, 
  formatMB, 
  copyDirectory, 
  cleanDirectory 
} from '../lib/utils.js';
import { getActiveToken } from '../lib/keyring.js';
import { fetchQuotaInfo } from '../lib/quota.js';

// ANSI styling helper functions
const style = {
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  blue: (text) => `\x1b[34m${text}\x1b[0m`,
  cyan: (text) => `\x1b[36m${text}\x1b[0m`,
  gray: (text) => `\x1b[90m${text}\x1b[0m`,
  bold: (text) => `\x1b[1m${text}\x1b[0m`,
  underline: (text) => `\x1b[4m${text}\x1b[0m`,
};

function printHelp() {
  console.log(`
${style.bold(style.cyan('Gemini Auth - Antigravity Multi-Account Profile Manager'))}
  
${style.bold('Usage:')}
  gemini-auth <command> [args]

${style.bold('Commands:')}
  ${style.green('list')} | ${style.green('ls')} [--refresh]    List all configured accounts/profiles
  ${style.green('add <name>')} | ${style.green('login')}        Create a new profile for login
  ${style.green('switch <name>')} | ${style.green('use')}     Switch the active account
  ${style.green('run <name>')}                Launch the app with a specific profile (multi-instance)
  ${style.green('remove <name>')} | ${style.green('rm')}      Remove a profile and delete its data
  ${style.green('status')}                   Show currently active profile
  ${style.green('help')}                     Show this help message

${style.bold('Examples:')}
  gemini-auth list --refresh
  gemini-auth add work
  gemini-auth switch work
  gemini-auth run personal
`);
}

async function refreshAllQuotas() {
  const registry = await loadRegistry();
  const profiles = registry.profiles || [];
  
  if (profiles.length === 0) {
    console.log(style.yellow('No profiles configured to refresh.'));
    return;
  }

  console.log(style.cyan('\nRefreshing quotas for all accounts from Google API...'));
  
  for (const profile of profiles) {
    process.stdout.write(`  Refreshing ${style.bold(profile.name)}... `);
    try {
      // 1. Read token.json from profile path
      const tokenPath = path.join(profile.path, 'token.json');
      let tokenData = null;
      try {
        tokenData = await fs.readFile(tokenPath, 'utf8');
      } catch (err) {
        // If not found in profile path, and this is the active profile, try active keyring
        const activeName = registry.active_profile;
        if (profile.name === activeName) {
          const activeToken = getActiveToken();
          if (activeToken) {
            tokenData = JSON.stringify(activeToken);
          }
        }
      }

      if (!tokenData) {
        console.log(style.yellow('No token found (unauthenticated)'));
        profile.quota = null;
        continue;
      }

      const tokenObj = JSON.parse(tokenData);
      const refreshToken = tokenObj.token?.refresh_token;

      if (!refreshToken) {
        console.log(style.yellow('No refresh token found'));
        profile.quota = null;
        continue;
      }

      const quota = await fetchQuotaInfo(refreshToken);
      if (quota) {
        profile.quota = quota;
        console.log(style.green(`Success (Gemini: ${quota.gemini_5h}/${quota.gemini_weekly}, Claude: ${quota.claude_5h}/${quota.claude_weekly})`));
      } else {
        console.log(style.red('API Error or Expired Session'));
        profile.quota = null;
      }
    } catch (err) {
      console.log(style.red(`Failed: ${err.message}`));
      profile.quota = null;
    }
  }

  await saveRegistry(registry);
  console.log(style.green('Quota refresh complete!\n'));
}

async function listCommand(refresh = true) {
  if (refresh) {
    try {
      await refreshAllQuotas();
    } catch (err) {
      console.log(style.yellow(`Warning: Quota refresh failed: ${err.message}. Showing cached results.`));
    }
  }

  const profiles = await getProfiles();
  const activeProfile = await getActiveProfileName();

  if (profiles.length === 0) {
    console.log(style.yellow('No profiles configured yet. Create one with: gemini-auth add <name>'));
    return;
  }

  console.log(`\n${style.bold(style.cyan('Available Profiles:'))}`);
  console.log(style.gray('--------------------------------------------------------------------------------------------------------------------------------------'));
  console.log(`${style.bold('  Active   Profile Name    Alias / Email                   Plan        Gemini (5h/Wk)  Claude (5h/Wk)  Size        Last Used')}`);
  console.log(style.gray('--------------------------------------------------------------------------------------------------------------------------------------'));

  for (const profile of profiles) {
    const isActive = profile.name === activeProfile;
    const activeMarker = isActive ? style.green('  [√]   ') : '  [ ]   ';
    
    // Calculate folder size
    let sizeStr = '0.00 MB';
    try {
      const size = await getDirSize(profile.path);
      sizeStr = formatMB(size);
    } catch {}

    const nameCol = profile.name.padEnd(15).substring(0, 15);
    
    let info = profile.alias || '';
    if (profile.email) {
      info += ` (${profile.email})`;
    }
    const infoCol = info.padEnd(30).substring(0, 30);
    
    // Plan column
    const planCol = (profile.quota?.plan || '--').padEnd(11).substring(0, 11);
    
    // Quota columns
    const gemini5h = profile.quota?.gemini_5h || '--%';
    const geminiWk = profile.quota?.gemini_weekly || '--%';
    const geminiQuota = `${gemini5h} / ${geminiWk}`;
    
    const claude5h = profile.quota?.claude_5h || '--%';
    const claudeWk = profile.quota?.claude_weekly || '--%';
    const claudeQuota = `${claude5h} / ${claudeWk}`;
    
    const geminiCol = geminiQuota.padEnd(15);
    const claudeCol = claudeQuota.padEnd(15);
    const sizeCol = sizeStr.padEnd(11);

    const lastUsed = profile.last_used_at 
      ? new Date(profile.last_used_at).toLocaleString() 
      : 'Never';

    const line = `${activeMarker} ${style.bold(nameCol)} ${infoCol} ${planCol} ${geminiCol} ${claudeCol} ${sizeCol} ${lastUsed}`;
    console.log(isActive ? style.cyan(line) : line);
  }
  console.log(style.gray('--------------------------------------------------------------------------------------------------------------------------------------'));
  console.log(style.gray(`* Profiles path: ${PROFILES_DIR}`));
  console.log(style.gray(`* Real-time refresh is enabled by default. Run with '--no-refresh' to view cached values without API query.\n`));
}

async function addCommand(name, options = {}) {
  let profileName = name;
  if (!profileName) {
    profileName = await prompt('Enter profile name (e.g., work, personal): ');
  }

  profileName = profileName.trim().toLowerCase();
  if (!profileName) {
    console.error(style.red('Error: Profile name cannot be empty.'));
    return;
  }

  // Basic validation for name (alphanumeric and underscores/hyphens)
  if (!/^[a-z0-9_-]+$/.test(profileName)) {
    console.error(style.red('Error: Profile name can only contain letters, numbers, underscores, and hyphens.'));
    return;
  }

  const profiles = await getProfiles();
  if (profiles.some(p => p.name === profileName)) {
    console.error(style.red(`Error: Profile "${profileName}" already exists.`));
    return;
  }

  let alias = options.alias;
  if (alias === undefined || alias === null) {
    alias = await prompt(`Enter alias/display name for "${profileName}" (Default: ${profileName}): `);
  }
  if (!alias) {
    alias = profileName;
  }

  let email = options.email;
  if (email === undefined || email === null) {
    email = await prompt('Enter Google Account email (Optional): ');
  }

  console.log(`\nCreating profile "${style.bold(profileName)}"...`);

  // Prompt to copy current active directory
  let copyCurrent = options.import;
  if (copyCurrent === undefined || copyCurrent === null) {
    copyCurrent = await promptConfirm('Would you like to import current active App session/cookies into this profile?', true);
  }

  if (copyCurrent && isAppRunning()) {
    console.log(style.yellow('\nWarning: Antigravity App is currently running.'));
    console.log(style.yellow('To successfully import the session, Antigravity must be closed (otherwise files like Cookies are locked by the OS).'));
    
    let kill = options.force;
    if (kill === undefined || kill === null || kill === false) {
      kill = await promptConfirm('Would you like to force close Antigravity now to import the session?', false);
    }
    
    if (kill) {
      console.log(style.gray('Closing Antigravity processes...'));
      await killApp();
      await new Promise(r => setTimeout(r, 1000));
    } else {
      console.log(style.yellow('Warning: Proceeding without closing App. The session import will likely fail due to file locks.'));
    }
  }
  
  const profilePath = path.join(PROFILES_DIR, profileName);
  await ensureDir(profilePath);

  if (copyCurrent) {
    console.log(style.gray(`Copying default AppData to isolated profile path...`));
    try {
      await copyDirectory(DEFAULT_APPDATA_DIR, profilePath);
      console.log(style.green('Session imported successfully!'));
    } catch (err) {
      console.error(style.red(`Warning: Failed to import session. Profile created blank. Error: ${err.message}`));
    }
  } else {
    console.log(style.gray('Initialized profile as blank. You will need to log in when you run it.'));
  }

  await addProfile(profileName, alias, email);
  console.log(style.green(`Successfully created and registered profile: ${style.bold(profileName)}`));
}

async function switchCommand(name, options = {}) {
  let targetName = name;
  const profiles = await getProfiles();

  if (profiles.length === 0) {
    console.error(style.red('Error: No profiles configured. Please add one first: gemini-auth add <name>'));
    return;
  }

  if (!targetName) {
    console.log('\nSelect profile to switch to:');
    profiles.forEach((p, idx) => {
      console.log(`  [${idx + 1}] ${p.name} ${p.alias ? `(${p.alias})` : ''}`);
    });
    
    const choice = await prompt('Enter choice number (or name): ');
    const num = parseInt(choice, 10);
    if (!isNaN(num) && num > 0 && num <= profiles.length) {
      targetName = profiles[num - 1].name;
    } else {
      targetName = choice;
    }
  }

  targetName = targetName.trim().toLowerCase();
  const targetProfile = profiles.find(p => p.name === targetName || p.name.includes(targetName));

  if (!targetProfile) {
    console.error(style.red(`Error: Profile "${targetName}" not found.`));
    return;
  }

  const activeName = await getActiveProfileName();
  if (activeName === targetProfile.name) {
    console.log(style.yellow(`Profile "${targetProfile.name}" is already the active profile.`));
    return;
  }

  // Safety Check: Check if App is running
  if (isAppRunning()) {
    console.log(style.yellow('Warning: Antigravity App is currently running.'));
    let kill = options.force;
    if (!kill) {
      kill = await promptConfirm('We must close Antigravity to switch profiles. Force close it now?', true);
    }
    if (!kill) {
      console.log(style.red('Switch aborted. Please close Antigravity manually and try again.'));
      return;
    }
    console.log(style.gray('Closing Antigravity processes...'));
    await killApp();
    // Wait briefly for files to unlock
    await new Promise(r => setTimeout(r, 1000));
  }

  // If no active profile is tracked yet, backup current default directory to a profile
  if (!activeName) {
    console.log(style.yellow('\nWarning: Your current active Antigravity session is not saved in any profile.'));
    let backupDefault = options.force;
    if (backupDefault === undefined || backupDefault === null || backupDefault === false) {
      backupDefault = await promptConfirm('Would you like to backup your current session into a new profile (e.g. "default") first?', true);
    }
    
    if (backupDefault) {
      const defaultName = 'default';
      let uniqueDefaultName = defaultName;
      let count = 1;
      while (profiles.some(p => p.name === uniqueDefaultName)) {
        uniqueDefaultName = `${defaultName}_${count}`;
        count++;
      }
      console.log(style.gray(`Creating backup profile "${uniqueDefaultName}"...`));
      const backupPath = path.join(PROFILES_DIR, uniqueDefaultName);
      await ensureDir(backupPath);
      try {
        await copyDirectory(DEFAULT_APPDATA_DIR, backupPath);
        await addProfile(uniqueDefaultName, 'Original Default Session', '');
        console.log(style.green(`Backup profile "${uniqueDefaultName}" created successfully.`));
      } catch (err) {
        console.error(style.red(`Failed to backup session: ${err.message}`));
        let proceed = options.force;
        if (!proceed) {
          proceed = await promptConfirm('Do you want to proceed with switching without backup? (This will clear your current session!)', false);
        }
        if (!proceed) {
          console.log(style.red('Switch aborted.'));
          return;
        }
      }
    } else {
      let proceed = options.force;
      if (!proceed) {
        proceed = await promptConfirm('Proceeding will CLEAR your current active login session. Are you sure?', false);
      }
      if (!proceed) {
        console.log(style.red('Switch aborted.'));
        return;
      }
    }
  }

  console.log(`\nSwitching to profile: ${style.bold(style.cyan(targetProfile.name))}...`);

  // Step 1: Backup current default AppData to active profile folder
  if (activeName) {
    const activeProfile = profiles.find(p => p.name === activeName);
    if (activeProfile) {
      console.log(style.gray(`Backing up current session to profile "${activeProfile.name}"...`));
      try {
        await ensureDir(activeProfile.path);
        await copyDirectory(DEFAULT_APPDATA_DIR, activeProfile.path);
      } catch (err) {
        console.error(style.red(`Warning: Backup failed. Error: ${err.message}`));
      }
    }
  }

  // Step 2: Clean up the main APPDATA folder
  console.log(style.gray('Clearing current active AppData folder...'));
  await cleanDirectory(DEFAULT_APPDATA_DIR);

  // Step 3: Copy target profile data to default APPDATA folder
  console.log(style.gray(`Restoring session from profile "${targetProfile.name}"...`));
  try {
    await copyDirectory(targetProfile.path, DEFAULT_APPDATA_DIR);
  } catch (err) {
    console.error(style.red(`Error: Failed to restore session from profile. App may start fresh. Error: ${err.message}`));
  }

  // Step 4: Update Registry
  await updateActiveProfile(targetProfile.name);
  console.log(style.green(`Successfully switched to profile: ${style.bold(targetProfile.name)}`));
}

async function runCommand(name) {
  let targetName = name;
  const profiles = await getProfiles();

  if (profiles.length === 0) {
    console.error(style.red('Error: No profiles configured. Please add one first: gemini-auth add <name>'));
    return;
  }

  if (!targetName) {
    console.log('\nSelect profile to launch:');
    profiles.forEach((p, idx) => {
      console.log(`  [${idx + 1}] ${p.name} ${p.alias ? `(${p.alias})` : ''}`);
    });
    
    const choice = await prompt('Enter choice number: ');
    const num = parseInt(choice, 10);
    if (!isNaN(num) && num > 0 && num <= profiles.length) {
      targetName = profiles[num - 1].name;
    } else {
      console.error(style.red('Invalid selection.'));
      return;
    }
  }

  targetName = targetName.trim().toLowerCase();
  const targetProfile = profiles.find(p => p.name === targetName);

  if (!targetProfile) {
    console.error(style.red(`Error: Profile "${targetName}" not found.`));
    return;
  }

  console.log(style.cyan(`Launching Antigravity App with profile: ${style.bold(targetProfile.name)}...`));
  console.log(style.gray(`UserData Directory: ${targetProfile.path}`));

  const appPath = 'C:\\Users\\6\\AppData\\Local\\Programs\\antigravity\\Antigravity.exe';
  const command = `start "" "${appPath}" --user-data-dir="${targetProfile.path}"`;

  exec(command, (err) => {
    if (err) {
      console.error(style.red(`Error launching app: ${err.message}`));
      return;
    }
    console.log(style.green('App started successfully!'));
  });
}

async function removeCommand(name, options = {}) {
  let targetName = name;
  const profiles = await getProfiles();

  if (profiles.length === 0) {
    console.error(style.red('Error: No profiles configured.'));
    return;
  }

  if (!targetName) {
    targetName = await prompt('Enter profile name to delete: ');
  }

  targetName = targetName.trim().toLowerCase();
  const targetProfile = profiles.find(p => p.name === targetName);

  if (!targetProfile) {
    console.error(style.red(`Error: Profile "${targetName}" not found.`));
    return;
  }

  let confirm = options.force;
  if (confirm === undefined || confirm === null || confirm === false) {
    console.log(style.yellow(`\n${style.bold('WARNING:')} You are about to permanently delete the profile "${style.bold(targetProfile.name)}" and all its settings/cookies/chat history.`));
    confirm = await promptConfirm('Are you absolutely sure you want to delete this profile?', false);
  }
  
  if (!confirm) {
    console.log('Delete aborted.');
    return;
  }

  console.log(style.gray('Deleting profile directory...'));
  try {
    await fs.rm(targetProfile.path, { recursive: true, force: true });
  } catch (err) {
    console.error(style.red(`Warning: Failed to delete directory. Error: ${err.message}`));
  }

  await removeProfileFromRegistry(targetProfile.name);
  console.log(style.green(`Successfully removed profile: ${style.bold(targetProfile.name)}`));
}

async function statusCommand() {
  const activeName = await getActiveProfileName();
  if (!activeName) {
    console.log(`Active Profile: ${style.yellow('None (Default profile is currently in use)')}`);
  } else {
    const profiles = await getProfiles();
    const activeProfile = profiles.find(p => p.name === activeName);
    
    console.log(`\n${style.bold(style.cyan('Active Profile Status:'))}`);
    console.log(`  Name:        ${style.bold(style.green(activeName))}`);
    if (activeProfile) {
      console.log(`  Alias:       ${activeProfile.alias || 'None'}`);
      console.log(`  Email:       ${activeProfile.email || 'None'}`);
      console.log(`  Path:        ${activeProfile.path}`);
      try {
        const size = await getDirSize(activeProfile.path);
        console.log(`  Folder Size: ${formatMB(size)}`);
      } catch {}
    }
    console.log();
  }
}

function parseArgs(args) {
  const options = {
    alias: null,
    email: null,
    import: null,
    force: false,
    refresh: true
  };
  const commandArgs = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--alias' || arg === '-a') {
      options.alias = args[++i];
    } else if (arg === '--email' || arg === '-e') {
      options.email = args[++i];
    } else if (arg === '--import' || arg === '-i') {
      options.import = true;
    } else if (arg === '--no-import') {
      options.import = false;
    } else if (arg === '--force' || arg === '-f') {
      options.force = true;
    } else if (arg === '--refresh' || arg === '-r') {
      options.refresh = true;
    } else if (arg === '--no-refresh') {
      options.refresh = false;
    } else if (arg.startsWith('-')) {
      // ignore unknown flags
    } else {
      commandArgs.push(arg);
    }
  }

  return { commandArgs, options };
}

async function main() {
  const { commandArgs, options } = parseArgs(process.argv.slice(2));
  const command = commandArgs[0] ? commandArgs[0].toLowerCase() : 'help';

  try {
    switch (command) {
      case 'list':
      case 'ls':
        await listCommand(options.refresh);
        break;
      case 'add':
      case 'create':
      case 'login':
        await addCommand(commandArgs[1], options);
        break;
      case 'switch':
      case 'use':
        await switchCommand(commandArgs[1], options);
        break;
      case 'run':
      case 'launch':
        await runCommand(commandArgs[1]);
        break;
      case 'remove':
      case 'rm':
        await removeCommand(commandArgs[1], options);
        break;
      case 'status':
        await statusCommand();
        break;
      case 'help':
      case '-h':
      case '--help':
        printHelp();
        break;
      default:
        console.error(style.red(`Unknown command: ${command}`));
        printHelp();
        closePrompt();
        process.exit(1);
    }
    closePrompt();
  } catch (err) {
    console.error(style.red(`Fatal Error: ${err.message}`));
    closePrompt();
    process.exit(1);
  }
}

main();
