import fs from 'node:fs/promises';
import path from 'node:path';
import { exec, execSync } from 'node:child_process';
import readline from 'node:readline';

let rl = null;

function getRl() {
  if (!rl) {
    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }
  return rl;
}

// Simple interactive prompt
export function prompt(questionText) {
  const interfaceInstance = getRl();

  return new Promise((resolve) => {
    interfaceInstance.question(questionText, (answer) => {
      resolve(answer.trim());
    });
  });
}

export function closePrompt() {
  if (rl) {
    rl.close();
    rl = null;
  }
}

export async function promptConfirm(questionText, defaultYes = true) {
  const suffix = defaultYes ? ' [Y/n]: ' : ' [y/N]: ';
  const answer = await prompt(questionText + suffix);
  if (answer === '') return defaultYes;
  return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
}

// Check if Antigravity is running on Windows
export function isAppRunning() {
  try {
    const stdout = execSync('tasklist /FI "IMAGENAME eq Antigravity.exe" /NH', { encoding: 'utf8' });
    return stdout.toLowerCase().includes('antigravity.exe');
  } catch (err) {
    // Fallback search
    try {
      const stdout = execSync('tasklist', { encoding: 'utf8' });
      return stdout.toLowerCase().includes('antigravity.exe');
    } catch {
      return false;
    }
  }
}

// Kill Antigravity processes
export function killApp() {
  return new Promise((resolve) => {
    exec('taskkill /F /IM Antigravity.exe /IM language_server.exe /T', (err, stdout, stderr) => {
      // Ignore errors if processes were not running
      resolve();
    });
  });
}

// Get Directory Size recursively (returns size in bytes)
export async function getDirSize(dirPath) {
  let size = 0;
  try {
    const files = await fs.readdir(dirPath, { withFileTypes: true });
    for (const file of files) {
      const filePath = path.join(dirPath, file.name);
      if (file.isDirectory()) {
        size += await getDirSize(filePath);
      } else if (file.isFile()) {
        const stats = await fs.stat(filePath);
        size += stats.size;
      }
    }
  } catch (err) {
    // Ignore errors for unreadable files (like LOCK files)
  }
  return size;
}

// Format bytes to MB
export function formatMB(bytes) {
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

// Deep copy directory
export async function copyDirectory(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  // Use native fs.cp recursively (requires Node.js 16.7.0+)
  await fs.cp(src, dest, { recursive: true, force: true, errorOnExist: false });
}

// Clean directory contents without deleting the folder itself
export async function cleanDirectory(dirPath) {
  try {
    const files = await fs.readdir(dirPath);
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      await fs.rm(filePath, { recursive: true, force: true });
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}
