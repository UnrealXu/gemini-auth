import { execSync } from 'node:child_process';

const READ_PS_SCRIPT = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public class CredentialManager {
    [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool CredRead(string target, int type, int reservedFlag, out IntPtr credentialPtr);

    [DllImport("advapi32.dll", EntryPoint = "CredFree", SetLastError = true)]
    public static extern void CredFree(IntPtr buffer);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct CREDENTIAL {
        public int Flags;
        public int Type;
        public string TargetName;
        public string Comment;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
        public int CredentialBlobSize;
        public IntPtr CredentialBlob;
        public int Persist;
        public int AttributeCount;
        public IntPtr Attributes;
        public string TargetAlias;
        public string UserName;
    }

    public static string GetPasswordUTF8(string target) {
        IntPtr credPtr;
        if (CredRead(target, 1, 0, out credPtr)) {
            CREDENTIAL cred = (CREDENTIAL)Marshal.PtrToStructure(credPtr, typeof(CREDENTIAL));
            byte[] blob = new byte[cred.CredentialBlobSize];
            Marshal.Copy(cred.CredentialBlob, blob, 0, cred.CredentialBlobSize);
            string password = Encoding.UTF8.GetString(blob);
            CredFree(credPtr);
            return password;
        }
        return null;
    }
}
"@
$pass = [CredentialManager]::GetPasswordUTF8("gemini:antigravity")
if ($pass) { Write-Output $pass }
`;

const WRITE_PS_SCRIPT_TEMPLATE = (passwordB64) => `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public class CredentialManager {
    [DllImport("advapi32.dll", EntryPoint = "CredWriteW", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool CredWrite(ref CREDENTIAL credential, int reservedFlag);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct CREDENTIAL {
        public int Flags;
        public int Type;
        public string TargetName;
        public string Comment;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
        public int CredentialBlobSize;
        public IntPtr CredentialBlob;
        public int Persist;
        public int AttributeCount;
        public IntPtr Attributes;
        public string TargetAlias;
        public string UserName;
    }

    public static bool SetPassword(string target, string username, string password) {
        CREDENTIAL cred = new CREDENTIAL();
        cred.Type = 1;
        cred.TargetName = target;
        cred.UserName = username;
        cred.Persist = 2;

        byte[] blob = Encoding.UTF8.GetBytes(password);
        cred.CredentialBlobSize = blob.Length;
        cred.CredentialBlob = Marshal.AllocCoTaskMem(blob.Length);
        Marshal.Copy(blob, 0, cred.CredentialBlob, blob.Length);

        bool result = CredWrite(ref cred, 0);
        Marshal.FreeCoTaskMem(cred.CredentialBlob);
        return result;
    }
}
"@
$password = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String("${passwordB64}"))
$res = [CredentialManager]::SetPassword("gemini:antigravity", "antigravity", $password)
if ($res) { Write-Output "SUCCESS" } else { Write-Output "FAIL" }
`;

export function getActiveToken() {
  if (process.platform !== 'win32') return null;
  try {
    const encodedScript = Buffer.from(READ_PS_SCRIPT, 'utf16le').toString('base64');
    const stdout = execSync(`powershell -NoProfile -EncodedCommand ${encodedScript}`, { encoding: 'utf8' }).trim();
    if (stdout && stdout.startsWith('{')) {
      return JSON.parse(stdout);
    }
  } catch (err) {
    // Silently ignore or log
  }
  return null;
}

export function setActiveToken(tokenObj) {
  if (process.platform !== 'win32') return false;
  try {
    const tokenStr = JSON.stringify(tokenObj);
    const tokenB64 = Buffer.from(tokenStr, 'utf8').toString('base64');
    const psScript = WRITE_PS_SCRIPT_TEMPLATE(tokenB64);
    const encodedScript = Buffer.from(psScript, 'utf16le').toString('base64');
    
    const stdout = execSync(`powershell -NoProfile -EncodedCommand ${encodedScript}`, { encoding: 'utf8' }).trim();
    return stdout === 'SUCCESS';
  } catch (err) {
    // console.error("Keyring write error:", err.message);
  }
  return false;
}
