# Release Management Commands

This documentation describes the release management tools for comparing and promoting Saltcorn environments.

## Overview

The release management system provides three CLI commands:
- `release-compare` - Compare two Saltcorn environments or pack files
- `release-promote` - Promote changes from one environment to another
- `release-log` - View release promotion history

These tools enable controlled deployments between environments (e.g., from acceptance to production) with selective entity promotion and comprehensive logging.

## Commands

### release-compare

Compare two Saltcorn environments or pack files to identify differences.

#### Usage

```bash
saltcorn release-compare <source> <target> [options]
```

#### Arguments

- `source` - Source environment ('current') or path to pack file (.json or .zip)
- `target` - Target environment ('current') or path to pack file (.json or .zip)

#### Options

- `-t, --tenant <name>` - Tenant to operate on
- `-o, --output <path>` - Output file path for comparison report (JSON)
- `-v, --verbose` - Show all entities including unchanged

#### Examples

```bash
# Compare current environment to a backup
saltcorn release-compare current backup.zip

# Compare two backup files
saltcorn release-compare backup1.json backup2.json

# Save comparison report to file
saltcorn release-compare current backup.zip -o report.json

# Show all entities including unchanged
saltcorn release-compare current backup.zip -v

# Compare in a specific tenant
saltcorn release-compare current backup.zip -t mytenant
```

#### Output

The command displays:
- Added entities (new in source, not in target)
- Removed entities (in target but not in source)
- Modified entities (different between source and target)
- Unchanged entities (identical, shown with `-v`)
- Summary statistics

### release-promote

Promote changes from one environment to another with selective options.

#### Usage

```bash
saltcorn release-promote <source> [options]
```

#### Arguments

- `source` - Source pack file (.json or .zip) to promote from

#### Options

- `-t, --tenant <name>` - Target tenant to promote to
- `-c, --config <path>` - Path to promotion configuration file (JSON)
- `-g, --generateConfig <path>` - Generate a default promotion configuration file and exit
- `-d, --dry-run` - Perform a dry run without making changes
- `-y, --yes` - Skip confirmation prompt
- `-n, --notes <text>` - Release notes to include in the log
- `--no-log` - Skip logging to release log
- `-v, --verbose` - Verbose error output

#### Examples

```bash
# Generate a promotion configuration file
saltcorn release-promote acceptance.zip -g promotion-config.json

# Review the configuration file and edit as needed
# Edit promotion-config.json to select which entities to promote

# Perform a dry run to see what would be promoted
saltcorn release-promote acceptance.zip -c promotion-config.json --dry-run

# Promote to production with confirmation
saltcorn release-promote acceptance.zip -c promotion-config.json -t production

# Promote without confirmation
saltcorn release-promote acceptance.zip -c promotion-config.json -t production -y

# Promote with release notes
saltcorn release-promote acceptance.zip -c config.json --notes "Release v2.1.0 - New user dashboard"
```

#### Promotion Configuration File

The configuration file allows you to specify exactly which entities to promote. Generate one with `-g` and edit it:

```json
{
  "_comment": "Promotion configuration - specify which entities to promote",
  "include": {
    "tables": ["users", "products"],
    "views": "all",
    "pages": ["home", "dashboard"],
    "plugins": ["my-plugin"],
    "triggers": "all"
  }
}
```

Options for each entity type:
- `"all"` - Include all entities of this type
- `["name1", "name2"]` - Include specific entities by name
- Omit the key entirely to exclude all entities of that type

### release-log

View release promotion history and logs.

#### Usage

```bash
saltcorn release-log [options]
```

#### Options

- `-t, --tenant <name>` - Tenant to view logs for
- `-l, --limit <number>` - Limit number of log entries to display
- `-v, --verbose` - Show detailed entity information
- `-e, --export <path>` - Export logs to JSON file

#### Examples

```bash
# View all release logs
saltcorn release-log

# View last 10 releases
saltcorn release-log --limit 10

# View with detailed entity information
saltcorn release-log --verbose

# Export logs to JSON file
saltcorn release-log --export release-history.json

# View logs for specific tenant
saltcorn release-log -t production
```

#### Log Entry Format

Each log entry includes:
- Timestamp
- Source pack file
- Target environment/tenant
- List of promoted entities with counts
- Release notes
- User who performed the promotion

## Workflows

### Workflow 1: Acceptance to Production Promotion

1. **Create a backup of acceptance environment:**
   ```bash
   saltcorn backup -z -o acceptance-2024-12-10.zip
   ```

2. **Compare with production:**
   ```bash
   saltcorn release-compare acceptance-2024-12-10.zip current -t production -o comparison.json
   ```

3. **Review the comparison report** to understand what will change.

4. **Generate promotion configuration:**
   ```bash
   saltcorn release-promote acceptance-2024-12-10.zip -g promotion-config.json
   ```

5. **Edit the configuration file** to select specific entities to promote.

6. **Perform dry run:**
   ```bash
   saltcorn release-promote acceptance-2024-12-10.zip -c promotion-config.json -t production --dry-run
   ```

7. **Execute promotion:**
   ```bash
   saltcorn release-promote acceptance-2024-12-10.zip -c promotion-config.json -t production --notes "December release - New features"
   ```

8. **Verify in release log:**
   ```bash
   saltcorn release-log -t production --limit 1 -v
   ```

### Workflow 2: Partial Release with Remembered Settings

1. **Create promotion configuration once:**
   ```bash
   saltcorn release-promote source.zip -g prod-promotion-config.json
   # Edit prod-promotion-config.json to define what gets promoted
   ```

2. **Reuse configuration for subsequent releases:**
   ```bash
   saltcorn release-promote acceptance-latest.zip -c prod-promotion-config.json -t production -y
   ```

The configuration file can be version-controlled and reused across releases.

### Workflow 3: Audit and Rollback

1. **View release history:**
   ```bash
   saltcorn release-log -t production -v
   ```

2. **Export full history for auditing:**
   ```bash
   saltcorn release-log -t production --export audit-log.json
   ```

3. **If needed, rollback by promoting from an older backup:**
   ```bash
   saltcorn release-promote previous-backup.zip -t production
   ```

## Database Schema

The release management system creates a `_sc_release_logs` table with the following structure:

| Column | Type | Description |
|--------|------|-------------|
| id | integer | Primary key |
| timestamp | timestamp | When the promotion occurred |
| source | text | Source pack file name |
| target | text | Target tenant/environment |
| entities_promoted | json | Object with entity counts |
| notes | text | Release notes |
| promoted_by | text | User who performed promotion |

## Security Considerations

- Release logs are stored per tenant and respect tenant isolation
- Only users with CLI access can perform promotions
- The `promoted_by` field records who performed each promotion
- Configuration files can contain sensitive entity names - store securely
- Always perform dry runs before production promotions

## Best Practices

1. **Always compare before promoting** - Use `release-compare` to understand changes
2. **Use configuration files** - Create reusable promotion configurations
3. **Perform dry runs** - Test promotions with `--dry-run` before executing
4. **Add release notes** - Document what's being released with `--notes`
5. **Review logs regularly** - Use `release-log` to audit changes
6. **Version control configs** - Store promotion configurations in git
7. **Test in acceptance first** - Never promote directly to production
8. **Keep backups** - Always backup before promoting

## Troubleshooting

### Issue: "pack.json not found in zip file"
**Solution:** Ensure you're using a Saltcorn backup created with `saltcorn backup -z`

### Issue: "Unable to find table/view/page"
**Solution:** The entity may not exist in the source. Check with `release-compare` first.

### Issue: "Promotion cancelled"
**Solution:** You answered 'no' to the confirmation prompt. Use `-y` to skip or confirm with 'yes'.

### Issue: No release logs shown
**Solution:** The migration may not have run yet. Perform a promotion to create the table.

## Integration with CI/CD

The release management commands can be integrated into CI/CD pipelines:

```bash
#!/bin/bash
# Example deployment script

# Create backup of acceptance
saltcorn backup -z -o acceptance-$BUILD_NUMBER.zip

# Compare with production
saltcorn release-compare acceptance-$BUILD_NUMBER.zip current -t production -o comparison.json

# Promote if dry-run succeeds
saltcorn release-promote acceptance-$BUILD_NUMBER.zip -c prod-config.json -t production --dry-run
if [ $? -eq 0 ]; then
  saltcorn release-promote acceptance-$BUILD_NUMBER.zip -c prod-config.json -t production -y --notes "Build $BUILD_NUMBER"
else
  echo "Dry run failed, aborting promotion"
  exit 1
fi
```
