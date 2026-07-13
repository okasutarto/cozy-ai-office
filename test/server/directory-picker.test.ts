import { describe, expect, it } from "vitest";
import { directoryPickerCommand } from "../../src/server/system/directory-picker.js";

describe("native directory picker", () => {
  it("uses platform-native folder selection commands", () => {
    const windows = directoryPickerCommand("win32", "C:/projects");
    expect(windows.executable).toBe("powershell.exe");
    expect(windows.args).toContain("-STA");
    expect(windows.env?.COZY_PICKER_INITIAL).toBe("C:/projects");

    expect(directoryPickerCommand("darwin").executable).toBe("osascript");
    expect(directoryPickerCommand("linux").executable).toBe("zenity");
  });
});
