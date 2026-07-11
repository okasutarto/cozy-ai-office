# Security Policy

## Security Model and Limitations

Cozy Agent Office executes local processes and interacts with the host filesystem. Please review the security boundaries below before utilizing the tool:

1. **Local Loopback and Tokens**:
   - The application binds exclusively to the local loopback interface (`127.0.0.1`) on an ephemeral port. It does not listen on public interfaces.
   - API endpoints and WebSocket connections are protected by a cryptographically random session token passed via URI fragment and verified on every request.

2. **No Operating System Sandboxing**:
   - Isolating writes within temporary Git worktrees protects the repository history from accidental corruption, but it is **not** an OS-level sandbox (e.g. containers, chroot, or namespaces).
   - Mocked provider CLIs run with the user's execution privileges. Only run this software on local repositories and codebases you fully trust.

3. **Provider CLI Access**:
   - Authentication relies entirely on your local, officially logged-in CLI instances (`claude`, `codex`, `agy`). Cozy Agent Office does not store, extract, proxy, or collect API keys or login credentials.
   - Subscription availability, quotas, and access limits remain fully controlled by the respective provider.
   - Antigravity is eligible only for write Workers after explicitly passing capability checks via `--help` probes. Version 0.1 does not provide a read-only mode for Antigravity.
   - **Antigravity CLI Argument Exposure**: Under the current version, Antigravity prompts are passed as command-line arguments. This means prompt text may be visible to other local users/processes capable of reading process lists. Codex and Claude CLI prompts are securely transmitted via standard input (`stdin`).

4. **Repository Modifications**:
   - Files in the root workspace remain untouched throughout the parallel execution lifecycle. Code updates are fast-forward applied only after explicit manual confirmation from the Owner.

## Reporting a Vulnerability

To report security issues or disclosure concerns, please contact the maintainers directly at security@example.com instead of opening public GitHub issues.
