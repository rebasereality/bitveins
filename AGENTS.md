# Repository Guidelines

## File Size

Keep source files under 500 lines whenever practical. When a component, utility, or route grows beyond that size, prefer extracting cohesive composables, child components, or focused helper modules instead of continuing to add unrelated behavior to the same file.

## Service Restart & Health Checks

When building, updating, or restarting background services or production servers:
1. **Always verify health**: After restarting a service, perform an explicit runtime verification on `127.0.0.1` (e.g. `curl -s -i http://127.0.0.1:PORT/api/auth/session` or health check) to confirm the service is bound, running, and returning HTTP 200 OK before declaring completion.
2. **Keep services loopback-isolated**: Always bind to `HOST=127.0.0.1` so the service is only accessible internally via the Cloudflare Tunnel and never exposed directly on public network interfaces.
3. **Warn before service disruption**: Inform the user before terminating active backend or WebSocket processes that may disconnect their current session.
4. **Use systemd for service restart**: On this environment, Bitveins runs as a systemd unit. Always use `sudo systemctl restart bitveins.service` after a build instead of killing and running standalone `node` commands in the background.
5. **Wait for build completion before restarting**: When running `pnpm build` or background compilation tasks, **always await complete build termination** before issuing `sudo systemctl restart bitveins.service`. Restarting during an active build overwrites `.output/server` while files are being generated, causing incomplete route bundles (`ERR_MODULE_NOT_FOUND`) and breaking UI APIs.
