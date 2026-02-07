# Workflow and Schedule Examples

This directory contains example configurations for MeshCentral ScriptTask Enhanced.

## Workflows

### disk-space-remediation.json
Automatically cleans up disk space when usage exceeds 85%:
- Checks disk usage
- Attempts temporary file cleanup
- Falls back to log cleanup if needed
- Verifies cleanup was successful
- Sends notifications via Slack
- Escalates to email if all cleanup attempts fail

### security-patch-with-rollback.json
Applies security patches with automatic backup and rollback:
- Pre-flight system health check
- Creates system backup
- Installs security patch
- Verifies installation
- Post-installation health check
- Automatic rollback on any failure
- Multiple notification channels

### service-health-monitor.json
Monitors critical services and auto-restarts if down:
- Checks service status every 5 minutes
- Attempts automatic restart if down
- Verifies restart was successful
- Escalates through multiple channels if restart fails
- Supports retry with exponential backoff

## Schedules

### daily-security-scan.json
Runs security vulnerability scan daily at 2 AM:
- Cron-based scheduling
- Timezone-aware (EST)
- Runs on all nodes in specified mesh
- High priority
- Concurrency limits to prevent overload
- Random jitter to distribute load
- Queues missed jobs for later execution

## Usage

### Import via API

```bash
# Import workflow
curl -X POST http://localhost:8081/api/remediation/workflows \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d @examples/workflows/disk-space-remediation.json

# Import schedule
curl -X POST http://localhost:8081/api/schedules \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d @examples/schedules/daily-security-scan.json
```

### Customize

1. Replace placeholder IDs:
   - `CHECK_DISK_USAGE_SCRIPT_ID` → Your actual script ID
   - `MESH_ID_HERE` → Your mesh ID
   - `YOUR/WEBHOOK/URL` → Your webhook URL

2. Adjust timeouts and retry policies based on your environment

3. Update notification channels (Slack, Teams, Email) with your endpoints

4. Modify cron expressions and timezones as needed

## Best Practices

1. **Test First**: Test workflows in a staging environment
2. **Start Simple**: Begin with basic workflows, add complexity gradually
3. **Monitor Initially**: Watch logs closely when deploying new workflows
4. **Document Changes**: Keep notes on customizations
5. **Version Control**: Track workflow changes in git
6. **Backup Scripts**: Keep backups of rollback scripts
7. **Review Logs**: Regularly review execution logs
8. **Update Regularly**: Keep examples updated with new features

## Tips

- Use descriptive step IDs for easier debugging
- Add timeout values appropriate for your environment
- Test notification channels before deployment
- Use rollback scripts for critical operations
- Leverage conditional branching for complex logic
- Set appropriate concurrency limits
- Use jitter to distribute load across fleet
- Configure maintenance windows for change control periods
