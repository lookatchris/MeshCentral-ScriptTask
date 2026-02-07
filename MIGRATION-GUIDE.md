# Migration Guide: ScriptTask v1 to v2

## Overview

This guide will help you migrate from ScriptTask v1 to the Enhanced v2 version. The migration process is designed to be safe and reversible.

## What's Changed

### Breaking Changes

- ⚠️ **New database schema** - v2 schedules use different document structure
- ⚠️ **API on new port** - Enhanced API runs on port 8081 (configurable)
- ⚠️ **New dependencies** - Requires additional npm packages

### Backward Compatibility

- ✅ **v1 schedules continue to work** - Not auto-migrated by default
- ✅ **Original UI preserved** - Old UI still accessible
- ✅ **Existing scripts unchanged** - Script library remains compatible
- ✅ **Job history maintained** - Historical data is preserved

## Pre-Migration Checklist

Before starting the migration:

- [ ] Backup your MeshCentral database
- [ ] Document current schedules and configurations
- [ ] Test in staging environment first
- [ ] Ensure Node.js >= 14.0.0
- [ ] Verify sufficient disk space (500MB+ recommended)
- [ ] Schedule maintenance window
- [ ] Notify users of planned downtime

## Migration Steps

### Step 1: Backup Current System

```bash
# Stop MeshCentral
systemctl stop meshcentral

# Backup database (MongoDB)
mongodump --db meshcentral --out /backup/meshcentral-pre-v2-$(date +%Y%m%d)

# OR for NeDB
cp -r /opt/meshcentral/meshcentral-data /backup/meshcentral-data-pre-v2-$(date +%Y%m%d)

# Backup plugin directory
tar -czf /backup/scripttask-v1-$(date +%Y%m%d).tar.gz /opt/meshcentral/plugins/scripttask
```

### Step 2: Update Plugin Files

```bash
cd /opt/meshcentral/plugins/scripttask

# Pull latest changes
git fetch origin
git checkout v2.0.0

# Or download and extract
wget https://github.com/lookatchris/MeshCentral-ScriptTask/archive/v2.0.0.zip
unzip v2.0.0.zip
```

### Step 3: Install Dependencies

```bash
# Install backend dependencies
npm install

# Build web UI
cd webapp
npm install
npm run build
cd ..
```

### Step 4: Configure Enhanced Features

```bash
# Copy and edit configuration
cp config-enhanced.json.example config-enhanced.json
nano config-enhanced.json
```

Example configuration:

```json
{
  "name": "ScriptTask Enhanced",
  "version": "2.0.0",
  "apiServer": {
    "enabled": true,
    "port": 8081,
    "cors": true
  },
  "scheduler": {
    "enabled": true,
    "defaultTimezone": "UTC",
    "maxConcurrentJobs": 50
  },
  "remediation": {
    "enabled": true,
    "defaultTimeout": 300,
    "maxRetries": 3
  }
}
```

### Step 5: Update MeshCentral Config

Edit your MeshCentral `config.json`:

```json
{
  "settings": {
    // ... existing settings
  },
  "plugins": {
    "enabled": true,
    "scripttask": {
      "enhanced": true,
      "apiPort": 8081
    }
  }
}
```

### Step 6: Start MeshCentral

```bash
# Start MeshCentral
systemctl start meshcentral

# Monitor logs
tail -f /opt/meshcentral/meshcentral.log | grep ScriptTask
```

Look for these log messages:
```
ScriptTask: Enhanced plugin starting up...
ScriptTask: Database schema v2 ready
ScriptTask: Advanced scheduler initialized
ScriptTask: Remediation engine initialized
ScriptTask: API server started on port 8081
```

### Step 7: Verify Installation

```bash
# Check API health
curl http://localhost:8081/api/health

# Expected response:
# {"status":"ok","version":"2.0.0","timestamp":1234567890}

# Access new UI
# Open browser: http://your-server:8081
```

### Step 8: Migrate v1 Schedules (Optional)

**Important**: This step is optional. V1 schedules will continue to work without migration.

```bash
# Run migration script
node scripts/migrate-schedules.js

# Or via API
curl -X POST http://localhost:8081/api/admin/migrate-schedules \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

The migration will:
1. Convert interval-based schedules to cron expressions
2. Create new v2 schedule documents
3. Mark old schedules as migrated (but not delete them)
4. Log all migrations for review

### Step 9: Testing

After migration, test the following:

#### Test Original Features
```bash
# Run existing script manually
# Verify old schedules still work
# Check job history
# Test variable replacement
```

#### Test New Features
```bash
# Create a cron-based schedule via API
curl -X POST http://localhost:8081/api/schedules \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Schedule",
    "scriptId": "your-script-id",
    "cronExpression": "*/5 * * * *",
    "timezone": "UTC",
    "nodes": ["node-id"],
    "enabled": true
  }'

# Verify schedule appears in UI
# Check next run times
# Trigger manual execution
```

### Step 10: Monitor

Monitor for the first 24-48 hours:

```bash
# Watch logs
tail -f /opt/meshcentral/meshcentral.log

# Check job completion rates
# Monitor API response times
# Review any errors
```

## Rollback Procedure

If you need to rollback to v1:

### Quick Rollback

```bash
# Stop MeshCentral
systemctl stop meshcentral

# Restore v1 files
cd /opt/meshcentral/plugins
rm -rf scripttask
tar -xzf /backup/scripttask-v1-YYYYMMDD.tar.gz

# Restore database (MongoDB)
mongorestore --db meshcentral --drop /backup/meshcentral-pre-v2-YYYYMMDD

# OR for NeDB
rm -rf /opt/meshcentral/meshcentral-data
cp -r /backup/meshcentral-data-pre-v2-YYYYMMDD /opt/meshcentral/meshcentral-data

# Start MeshCentral
systemctl start meshcentral
```

### Selective Rollback (Keep v2, Disable Features)

Edit `config-enhanced.json`:

```json
{
  "apiServer": {
    "enabled": false
  },
  "scheduler": {
    "enabled": false
  },
  "remediation": {
    "enabled": false
  }
}
```

This will disable v2 features but keep the plugin installed.

### Rollback v2 Schedules to v1

```bash
# Via API
curl -X POST http://localhost:8081/api/admin/rollback-schedules \
  -H "Authorization: Bearer TOKEN"

# Or via script
node scripts/rollback-schedules.js
```

## Migration Data Mapping

### Schedule Migration

| v1 Field | v2 Field | Notes |
|----------|----------|-------|
| `interval` | `cronExpression` | Converted to cron syntax |
| `node` | `nodes` (array) | Now supports multiple nodes |
| `meshId` | `meshes` (array) | Now supports multiple meshes |
| N/A | `timezone` | New: defaults to UTC |
| N/A | `priority` | New: defaults to 'normal' |
| N/A | `concurrency` | New: defaults applied |
| `nextRunTime` | `nextRun` | Timestamp format unchanged |
| `lastRunTime` | `lastRun` | Timestamp format unchanged |

### Interval to Cron Conversion

| v1 Interval | v2 Cron Expression |
|-------------|-------------------|
| `minute` | `*/1 * * * *` |
| `hourly` | `0 * * * *` |
| `daily` | `0 0 * * *` |
| `weekly` | `0 0 * * 0` |

## Common Migration Issues

### Issue: API Server Won't Start

**Symptom**: Port 8081 already in use

**Solution**:
```bash
# Find process using port
lsof -i :8081

# Change port in config
nano config-enhanced.json
# Set "port": 8082

# Restart MeshCentral
systemctl restart meshcentral
```

### Issue: Schedules Not Running

**Symptom**: V2 schedules created but jobs not executing

**Solution**:
1. Check cron expression validity: https://crontab.guru
2. Verify timezone setting
3. Check node online status
4. Review maintenance windows
5. Check logs for errors

### Issue: Database Migration Fails

**Symptom**: Error during schedule migration

**Solution**:
```bash
# Check database connectivity
# Verify database has v2 schema indexes
# Re-run migration with --force flag
node scripts/migrate-schedules.js --force

# Check migration logs
cat /opt/meshcentral/meshcentral.log | grep Migration
```

### Issue: Original UI Not Loading

**Symptom**: Old iframe UI shows errors

**Solution**:
```bash
# Verify original files exist
ls -la /opt/meshcentral/plugins/scripttask/views/

# Check MeshCentral config
# Ensure plugin path is correct

# Restart MeshCentral
systemctl restart meshcentral
```

### Issue: High Memory Usage

**Symptom**: Increased memory consumption after upgrade

**Solution**:
```json
// Reduce concurrent jobs in config-enhanced.json
{
  "scheduler": {
    "maxConcurrentJobs": 20  // Reduce from 50
  }
}
```

## Post-Migration Cleanup

After successful migration and testing (wait 1-2 weeks):

```bash
# Remove migrated v1 schedules (optional)
node scripts/cleanup-v1-schedules.js --dry-run  # Preview
node scripts/cleanup-v1-schedules.js --confirm  # Actually delete

# Remove old backups (after 30 days)
find /backup -name "meshcentral-pre-v2-*" -mtime +30 -delete
```

## Feature Adoption Timeline

Recommended timeline for adopting new features:

### Week 1: Observation
- Monitor v1 schedules continue working
- Familiarize with new UI
- Review API documentation

### Week 2: Testing
- Create 1-2 test v2 schedules
- Test cron expressions
- Verify timezone handling

### Week 3: Migration
- Migrate 25% of schedules to v2
- Monitor performance
- Address any issues

### Week 4: Expansion
- Migrate remaining schedules
- Start using remediation workflows
- Integrate with external systems via API

### Week 5+: Optimization
- Fine-tune concurrency settings
- Create maintenance windows
- Implement advanced workflows

## Best Practices

1. **Start Small**: Migrate a few schedules first
2. **Test Thoroughly**: Validate in staging before production
3. **Monitor Closely**: Watch logs for first few days
4. **Document Changes**: Keep notes on what works/doesn't
5. **Backup Regularly**: Automated backups before major changes
6. **Update Gradually**: Don't rush to use all features at once
7. **Train Users**: Provide documentation and training
8. **Plan Rollback**: Always have a rollback plan ready

## Support

If you encounter issues during migration:

1. **Check Logs**: Review MeshCentral logs first
2. **Consult Docs**: Re-read this guide and README-ENHANCED.md
3. **Search Issues**: Check GitHub issues for similar problems
4. **Ask Community**: Post on MeshCentral forums
5. **Report Bugs**: Open GitHub issue with logs and details

## Migration Checklist

Use this checklist to track your progress:

- [ ] Pre-migration backup completed
- [ ] V2 files deployed
- [ ] Dependencies installed
- [ ] UI built successfully
- [ ] Configuration file created
- [ ] MeshCentral restarted
- [ ] API health check passed
- [ ] New UI accessible
- [ ] V1 schedules still working
- [ ] Test v2 schedule created
- [ ] Migration script executed (if applicable)
- [ ] All tests passed
- [ ] Monitoring setup
- [ ] Documentation updated
- [ ] Users notified
- [ ] Rollback plan documented
- [ ] Post-migration cleanup scheduled

## Version Compatibility

| Component | v1 | v2 | Compatible |
|-----------|----|----|------------|
| Database Schema | v1 | v2 | Yes (both supported) |
| Schedule Format | Interval | Cron | Yes (v1 still works) |
| API | None | REST + WS | N/A (new feature) |
| UI | Original | Vue 3 SPA | Yes (both available) |
| Job Format | v1 | Enhanced | Yes (backward compatible) |
| Scripts | v1 | v1 | Yes (unchanged) |

## Conclusion

The migration from v1 to v2 is designed to be safe and gradual. You can continue using v1 features while slowly adopting v2 enhancements. Take your time, test thoroughly, and don't hesitate to ask for help if needed.

---

**Last Updated**: 2026-02-07  
**Version**: 2.0.0
