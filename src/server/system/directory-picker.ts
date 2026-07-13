import { spawn } from "node:child_process";
import { AppError } from "../errors.js";

export type DirectoryPicker = (initialPath?: string | null) => Promise<string | null>;

type PickerCommand = {
  executable: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
};

export function directoryPickerCommand(
  platform: NodeJS.Platform,
  initialPath?: string | null,
): PickerCommand {
  if (platform === "win32") {
    const script = [
      "Add-Type -AssemblyName System.Windows.Forms",
      "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
      "$dialog.Description = 'Select a Git repository folder'",
      "if ($env:COZY_PICKER_INITIAL -and (Test-Path -LiteralPath $env:COZY_PICKER_INITIAL)) { $dialog.SelectedPath = $env:COZY_PICKER_INITIAL }",
      "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Write-Output $dialog.SelectedPath }",
    ].join("; ");
    return {
      executable: "powershell.exe",
      args: ["-NoLogo", "-NoProfile", "-STA", "-Command", script],
      env: { ...process.env, COZY_PICKER_INITIAL: initialPath?.trim() ?? "" },
    };
  }
  if (platform === "darwin") {
    return {
      executable: "osascript",
      args: ["-e", 'POSIX path of (choose folder with prompt "Select a Git repository folder")'],
    };
  }
  return {
    executable: "zenity",
    args: ["--file-selection", "--directory", "--title=Select a Git repository folder"],
  };
}

export const pickDirectory: DirectoryPicker = async (initialPath) => {
  const command = directoryPickerCommand(process.platform, initialPath);
  return new Promise((resolve, reject) => {
    const child = spawn(command.executable, command.args, {
      env: command.env,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.once("error", (error: NodeJS.ErrnoException) => {
      reject(
        new AppError(
          "directory_picker_unavailable",
          error.code === "ENOENT"
            ? "No native folder picker is available on this system"
            : "Native folder picker could not be opened",
          500,
        ),
      );
    });
    child.once("close", (code) => {
      const selectedPath = Buffer.concat(stdout).toString("utf8").trim();
      if (code === 0) {
        resolve(selectedPath || null);
        return;
      }
      const diagnostic = Buffer.concat(stderr).toString("utf8");
      if (code === 1 || /cancel|canceled|cancelled/u.test(diagnostic)) {
        resolve(null);
        return;
      }
      reject(
        new AppError("directory_picker_failed", "Native folder picker closed unexpectedly", 500),
      );
    });
  });
};
