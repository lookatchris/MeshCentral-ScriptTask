# MeshCentral ScriptTask Enhanced - v2.0.0

## Overview

MeshCentral ScriptTask Enhanced is a major upgrade to the original ScriptTask plugin, adding enterprise-grade features including advanced cron-based scheduling, intelligent remediation workflows, and a modern REST API with WebSocket support.

## New Features

### 1. Advanced Cron-Based Scheduler

Replace simple interval-based scheduling with powerful cron expressions:

- **Cron Expression Support**: Standard cron syntax (`*/5 * * * *`, `0 2 * * *`)
- **Special Expressions**: `@hourly`, `@daily`, `@weekly`, `@monthly`
- **Timezone Awareness**: Schedule jobs in any timezone with DST handling
- **Priority Queue**: Critical, High, Normal, Low priority levels
- **Concurrency Controls**: Limit jobs per node, mesh, or globally
- **Dependency Chains**: Run Script B only after Script A completes
- **Maintenance Windows**: Define blackout periods with priority overrides
- **Missed Job Policies**: Skip, run immediately, or queue missed jobs
- **Jitter/Randomization**: Distribute load by adding random delays

### 2. Remediation Engine

Automate incident response with multi-step workflows:

- **Visual Workflow Builder**: Drag-and-drop workflow creation (via API/UI)
- **Conditional Branching**: Execute different steps based on results
- **Multiple Step Types**: Script execution, webhooks, email, delays, conditions
- **Condition Evaluators**: Exit codes, output patterns, regex, JSON path, thresholds
- **Retry Logic**: Exponential backoff and multi-tier escalation
- **Automatic Rollback**: Restore previous state on workflow failure
- **Health Checks**: Validate remediation success
- **Alerting**: Slack, Teams, Discord, email notifications
- **Node Quarantine**: Automatically isolate problematic nodes

### 3. Modern REST API & WebSocket

Full-featured API on port 8081:

- **RESTful Endpoints**: Complete CRUD for schedules, workflows, jobs, scripts, nodes
- **Real-Time Updates**: WebSocket push notifications for job status changes
- **JWT Authentication**: Secure token-based authentication
- **API Keys**: Programmatic access for integrations
- **Rate Limiting**: Protect against abuse
- **CORS Support**: Enable cross-origin requests
- **Request Logging**: Track all API usage
- **Swagger Docs**: Auto-generated API documentation (planned)

### 4. Modern Web UI

Vue 3 single-page application (SPA):

- **Dashboard**: Overview of schedules, jobs, workflows with statistics
- **Schedule Manager**: Visual cron builder and schedule editor
- **Workflow Builder**: Drag-and-drop remediation workflow designer
- **Job Queue**: Real-time job monitoring with filters
- **Script Library**: Centralized script management
- **Node Management**: View agents, quarantine nodes, view health
- **Dark Mode**: Light and dark theme support
- **Responsive**: Mobile-friendly design
- **Real-Time**: WebSocket integration for live updates

## Installation

### Prerequisites

- MeshCentral >= 1.0.0
- Node.js >= 14.0.0
- MongoDB or NeDB

### Quick Install

1. Enable plugins in MeshCentral config:
   ```json
   {
     "plugins": {
       "enabled": true
     }
   }
   ```

2. Install ScriptTask Enhanced:
   ```bash
   # Install via MeshCentral plugin manager
   # Or manually clone to plugins directory
   cd /opt/meshcentral/plugins
   git clone https://github.com/lookatchris/MeshCentral-ScriptTask.git scripttask
   cd scripttask
   npm install
   ```

3. Build the Web UI:
   ```bash
   cd webapp
   npm install
   npm run build
   ```

4. Restart MeshCentral:
   ```bash
   systemctl restart meshcentral
   # or
   npm start
   ```

5. Access the enhanced UI:
   ```
   http://your-meshcentral:8081
   ```

## Configuration

Edit `config-enhanced.json`:

```json
{
  "name": "ScriptTask Enhanced",
  "version": "2.0.0",
  "apiServer": {
    "enabled": true,
    "port": 8081,
    "cors": true,
    "allowedOrigins": ["http://localhost:8081"]
  },
  "scheduler": {
    "enabled": true,
    "defaultTimezone": "UTC",
    "maxConcurrentJobs": 50,
    "checkIntervalSeconds": 30
  },
  "remediation": {
    "enabled": true,
    "defaultTimeout": 300,
    "maxRetries": 3,
    "exponentialBackoff": true
  },
  "webUI": {
    "enabled": true,
    "path": "/webapp/dist"
  }
}
```

## Quick Start Guide

### Creating an Advanced Schedule

```javascript
// Via API
POST /api/schedules
{
  "name": "Daily Security Scan",
  "description": "Run security scan every day at 2 AM",
  "scriptId": "script-id-here",
  "cronExpression": "0 2 * * *",
  "timezone": "America/New_York",
  "nodes": ["node-id-1", "node-id-2"],
  "priority": "high",
  "concurrency": {
    "maxPerNode": 1,
    "maxPerMesh": 10,
    "maxGlobal": 50
  },
  "enabled": true
}
```

### Creating a Remediation Workflow

```javascript
// Via API
POST /api/remediation/workflows
{
  "name": "Disk Space Remediation",
  "description": "Clean up disk space when threshold exceeded",
  "trigger": {
    "type": "threshold",
    "condition": {
      "type": "threshold",
      "field": "diskUsage",
      "operator": "gt",
      "value": 90
    }
  },
  "steps": [
    {
      "id": "step1",
      "type": "script",
      "scriptId": "cleanup-script-id",
      "timeout": 300,
      "onSuccess": "step2",
      "onFailure": "step3"
    },
    {
      "id": "step2",
      "type": "webhook",
      "url": "https://slack.com/webhook",
      "method": "POST",
      "webhookType": "slack",
      "onSuccess": null
    },
    {
      "id": "step3",
      "type": "webhook",
      "url": "https://teams.microsoft.com/webhook",
      "method": "POST",
      "webhookType": "teams",
      "onSuccess": null
    }
  ],
  "rollbackEnabled": true,
  "enabled": true
}
```

## Cron Expression Guide

### Basic Syntax

```
* * * * *
│ │ │ │ │
│ │ │ │ └─── Day of week (0-7, Sun-Sat)
│ │ │ └───── Month (1-12)
│ │ └─────── Day of month (1-31)
│ └───────── Hour (0-23)
└─────────── Minute (0-59)
```

### Examples

```bash
*/5 * * * *          # Every 5 minutes
0 */2 * * *          # Every 2 hours
0 9 * * 1-5          # 9 AM weekdays
0 0 1 * *            # First day of month
0 2 * * 0            # 2 AM every Sunday
0 0 * * 0,6          # Midnight on weekends
*/15 9-17 * * 1-5    # Every 15 min, 9-5, weekdays
```

### Special Expressions

```bash
@hourly              # 0 * * * *
@daily               # 0 0 * * *
@weekly              # 0 0 * * 0
@monthly             # 0 0 1 * *
@yearly              # 0 0 1 1 *
```

## API Reference

### Authentication

All API requests require authentication via:

1. **JWT Token**:
   ```bash
   curl -H "Authorization: Bearer <token>" http://localhost:8081/api/schedules
   ```

2. **API Key**:
   ```bash
   curl -H "X-API-Key: <api-key>" http://localhost:8081/api/schedules
   ```

### Endpoints

#### Schedules

- `GET /api/schedules` - List all schedules
- `POST /api/schedules` - Create schedule
- `GET /api/schedules/:id` - Get schedule
- `PUT /api/schedules/:id` - Update schedule
- `DELETE /api/schedules/:id` - Delete schedule
- `POST /api/schedules/:id/pause` - Pause schedule
- `POST /api/schedules/:id/resume` - Resume schedule
- `GET /api/schedules/:id/next-runs` - Preview next runs
- `POST /api/schedules/:id/run-now` - Trigger immediately

#### Remediation

- `POST /api/remediation/workflows` - Create workflow
- `GET /api/remediation/workflows` - List workflows
- `GET /api/remediation/workflows/:id` - Get workflow
- `PUT /api/remediation/workflows/:id` - Update workflow
- `DELETE /api/remediation/workflows/:id` - Delete workflow
- `POST /api/remediation/workflows/:id/test` - Test workflow
- `GET /api/remediation/executions` - List executions
- `GET /api/remediation/executions/:id` - Get execution
- `POST /api/remediation/rollback/:id` - Rollback

#### Jobs

- `GET /api/jobs` - List jobs with filters
- `GET /api/jobs/:id` - Get job details
- `POST /api/jobs/:id/cancel` - Cancel job
- `POST /api/jobs/:id/retry` - Retry job
- `GET /api/jobs/stats` - Job statistics

#### Scripts

- `GET /api/scripts` - List scripts
- `POST /api/scripts` - Create script
- `GET /api/scripts/:id` - Get script
- `PUT /api/scripts/:id` - Update script
- `DELETE /api/scripts/:id` - Delete script
- `POST /api/scripts/:id/run` - Run immediately

#### Nodes

- `GET /api/nodes` - List nodes
- `GET /api/nodes/:id` - Get node
- `GET /api/nodes/:id/jobs` - Node jobs
- `GET /api/nodes/:id/health` - Health status
- `POST /api/nodes/:id/quarantine` - Quarantine
- `POST /api/nodes/:id/unquarantine` - Unquarantine

### WebSocket Events

Connect to `ws://localhost:8081/socket.io`:

```javascript
const socket = io('http://localhost:8081');

socket.on('job:created', (data) => {
  console.log('New job:', data);
});

socket.on('job:updated', (data) => {
  console.log('Job updated:', data);
});

socket.on('schedule:created', (data) => {
  console.log('New schedule:', data);
});

socket.on('execution:started', (data) => {
  console.log('Workflow started:', data);
});
```

## Workflow Examples

### Example 1: Disk Space Alert and Cleanup

```json
{
  "name": "Disk Space Management",
  "trigger": {
    "type": "threshold",
    "condition": {
      "type": "threshold",
      "field": "diskUsagePercent",
      "operator": "gt",
      "value": 85
    }
  },
  "steps": [
    {
      "id": "check",
      "type": "script",
      "scriptId": "check-disk-usage",
      "onSuccess": "cleanup",
      "onFailure": "alert"
    },
    {
      "id": "cleanup",
      "type": "script",
      "scriptId": "cleanup-temp-files",
      "onSuccess": "verify",
      "onFailure": "alert"
    },
    {
      "id": "verify",
      "type": "script",
      "scriptId": "verify-disk-space",
      "onSuccess": "notify-success",
      "onFailure": "escalate"
    },
    {
      "id": "notify-success",
      "type": "webhook",
      "url": "https://hooks.slack.com/...",
      "method": "POST",
      "webhookType": "slack"
    },
    {
      "id": "alert",
      "type": "webhook",
      "url": "https://hooks.slack.com/...",
      "method": "POST",
      "webhookType": "slack"
    },
    {
      "id": "escalate",
      "type": "email",
      "to": "admin@company.com",
      "subject": "Critical: Disk cleanup failed"
    }
  ]
}
```

### Example 2: Security Patch with Rollback

```json
{
  "name": "Security Patch Application",
  "steps": [
    {
      "id": "backup",
      "type": "script",
      "scriptId": "create-backup",
      "timeout": 600,
      "rollbackScriptId": "restore-backup",
      "onSuccess": "install-patch",
      "onFailure": "notify-failure"
    },
    {
      "id": "install-patch",
      "type": "script",
      "scriptId": "install-security-patch",
      "timeout": 900,
      "retryPolicy": {
        "maxAttempts": 3,
        "backoffType": "exponential",
        "delaySeconds": 60
      },
      "onSuccess": "verify-patch",
      "onFailure": "rollback-trigger"
    },
    {
      "id": "verify-patch",
      "type": "script",
      "scriptId": "verify-installation",
      "successCriteria": {
        "type": "exitCode",
        "exitCode": 0
      },
      "onSuccess": "cleanup",
      "onFailure": "rollback-trigger"
    },
    {
      "id": "cleanup",
      "type": "script",
      "scriptId": "cleanup-temp-files",
      "onSuccess": "notify-success"
    }
  ],
  "rollbackEnabled": true
}
```

## Maintenance Windows

Create maintenance windows to prevent jobs during specific times:

```javascript
POST /api/maintenance-windows
{
  "name": "Nightly Maintenance",
  "cronExpression": "0 2 * * *",
  "timezone": "America/New_York",
  "duration": 7200,  // 2 hours
  "allowedPriorities": ["critical"],  // Only critical jobs allowed
  "enabled": true
}
```

## Migration from v1

See [MIGRATION-GUIDE.md](MIGRATION-GUIDE.md) for detailed migration instructions.

### Quick Migration

```bash
# Backup current data
mongodump --db meshcentral

# Run migration
node scripts/migrate-v1-to-v2.js

# Verify migration
# Check logs for "Successfully migrated X schedules"
```

## Troubleshooting

### API Server Won't Start

1. Check port 8081 is available:
   ```bash
   netstat -an | grep 8081
   ```

2. Check logs:
   ```bash
   tail -f /opt/meshcentral/meshcentral.log
   ```

3. Verify config:
   ```bash
   cat config-enhanced.json
   ```

### Schedules Not Running

1. Check scheduler is enabled in config
2. Verify cron expression is valid
3. Check maintenance windows
4. Verify nodes are online
5. Check concurrency limits

### Workflow Failures

1. Check execution logs: `GET /api/remediation/executions/:id`
2. Verify script IDs are correct
3. Check condition evaluations
4. Review timeout settings
5. Check escalation policies

## Performance Tuning

### High-Volume Environments

```json
{
  "scheduler": {
    "maxConcurrentJobs": 100,
    "checkIntervalSeconds": 15
  },
  "apiServer": {
    "rateLimitMaxRequests": 500,
    "rateLimitWindowMs": 900000
  }
}
```

### Low-Resource Systems

```json
{
  "scheduler": {
    "maxConcurrentJobs": 10,
    "checkIntervalSeconds": 60
  },
  "remediation": {
    "defaultTimeout": 180,
    "maxRetries": 2
  }
}
```

## Security Considerations

- Always use HTTPS in production
- Rotate JWT secrets regularly
- Limit API key permissions
- Use rate limiting
- Review audit logs regularly
- Quarantine suspicious nodes immediately
- Test workflows in staging first

## Support

- GitHub Issues: https://github.com/lookatchris/MeshCentral-ScriptTask/issues
- MeshCentral Forums: https://meshcentral.com/forum
- Documentation: https://github.com/lookatchris/MeshCentral-ScriptTask/wiki

## License

Apache-2.0

## Credits

- Original ScriptTask: Ryan Blenis
- Enhanced Features: Copilot
- MeshCentral: Ylian Saint-Hilaire

## Changelog

See [changelog.md](changelog.md) for version history.

---

**Note**: This is version 2.0.0 - a major upgrade. Review the migration guide before upgrading from v1.
