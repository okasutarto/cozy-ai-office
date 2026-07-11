const RULES: ReadonlyArray<[RegExp, string]> = [
  [/\b(authorization\s*:\s*bearer\s+)[^\s]+/giu, "$1[REDACTED]"],
  [/\b(sk-(?:(?:proj|svcacct)-)?[A-Za-z0-9_-]{16,})\b/gu, "[REDACTED_OPENAI_KEY]"],
  [/\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/gu, "[REDACTED_GITHUB_TOKEN]"],
  [/\b(AIza[A-Za-z0-9_-]{30,})\b/gu, "[REDACTED_GOOGLE_KEY]"],
  [/\b(ANTHROPIC_API_KEY\s*=\s*)[^\s]+/giu, "$1[REDACTED]"],
  [/\b(OPENAI_API_KEY\s*=\s*)[^\s]+/giu, "$1[REDACTED]"],
  [
    /-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+ PRIVATE KEY-----/gu,
    "[REDACTED_PRIVATE_KEY]",
  ],
];

export function redactText(text: string): string {
  return RULES.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), text);
}

export class StreamingRedactor {
  private pending = "";
  private inPrivateKey = false;

  push(chunk: string): string[] {
    this.pending += chunk;
    const output: string[] = [];
    let newline = this.pending.indexOf("\n");
    while (newline >= 0) {
      output.push(this.redactLine(this.pending.slice(0, newline + 1)));
      this.pending = this.pending.slice(newline + 1);
      newline = this.pending.indexOf("\n");
    }
    if (this.pending.length > 65_536) {
      const split = this.pending.length - 512;
      output.push(this.redactLine(this.pending.slice(0, split)));
      this.pending = this.pending.slice(split);
    }
    return output;
  }

  flush(): string[] {
    if (!this.pending) return [];
    const output = [this.redactLine(this.pending)];
    this.pending = "";
    return output;
  }

  private redactLine(line: string): string {
    if (this.inPrivateKey) {
      if (/-----END [A-Z ]+ PRIVATE KEY-----/u.test(line)) this.inPrivateKey = false;
      return "";
    }
    if (/-----BEGIN [A-Z ]+ PRIVATE KEY-----/u.test(line)) {
      this.inPrivateKey = !/-----END [A-Z ]+ PRIVATE KEY-----/u.test(line);
      return "[REDACTED_PRIVATE_KEY]\n";
    }
    return redactText(line);
  }
}
