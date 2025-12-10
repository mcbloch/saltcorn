/**
 * @category saltcorn-cli
 * @module commands/release-log
 */
const { Command, Flags } = require("@oclif/core");
const { maybe_as_tenant, init_some_tenants } = require("../common");

/**
 * ReleaseLogCommand Class
 * View and manage release logs
 * @extends oclif.Command
 * @category saltcorn-cli
 */
class ReleaseLogCommand extends Command {
  /**
   * Format log entry for display
   * @param {object} log - Log entry
   * @param {boolean} verbose - Show full details
   * @returns {string} Formatted log entry
   */
  formatLogEntry(log, verbose) {
    const timestamp = new Date(log.timestamp).toLocaleString();
    const output = [];
    
    output.push(`\n[${ log.id}] ${timestamp}`);
    output.push(`  Source: ${log.source}`);
    output.push(`  Target: ${log.target}`);
    output.push(`  Promoted by: ${log.promoted_by}`);
    
    if (log.notes) {
      output.push(`  Notes: ${log.notes}`);
    }

    if (verbose && log.entities_promoted) {
      output.push(`  Entities:`);
      const entities = typeof log.entities_promoted === 'string' 
        ? JSON.parse(log.entities_promoted) 
        : log.entities_promoted;
      
      for (const [type, count] of Object.entries(entities)) {
        if (count > 0) {
          output.push(`    - ${type}: ${count}`);
        }
      }
    }

    return output.join('\n');
  }

  /**
   * @returns {Promise<void>}
   */
  async run() {
    const { flags } = await this.parse(ReleaseLogCommand);

    try {
      await init_some_tenants(flags.tenant);

      await maybe_as_tenant(flags.tenant, async () => {
        const db = require("@saltcorn/data/db");

        // Build query
        const queryOptions = {
          orderBy: "timestamp",
          orderDesc: true,
        };

        if (flags.limit) {
          queryOptions.limit = flags.limit;
        }

        // Fetch logs
        let logs;
        try {
          logs = await db.select("_sc_release_logs", {}, queryOptions);
        } catch (error) {
          // Table might not exist yet
          console.log("No release logs found. The release log table has not been created yet.");
          console.log("Logs will be created automatically when you perform your first promotion.");
          this.exit(0);
          return;
        }

        if (logs.length === 0) {
          console.log("No release logs found.");
          this.exit(0);
          return;
        }

        console.log(`\n=== Release Logs (${logs.length} entries) ===`);
        
        for (const log of logs) {
          console.log(this.formatLogEntry(log, flags.verbose));
        }

        // Summary
        if (!flags.verbose && logs.length > 0) {
          console.log("\nUse --verbose to see detailed entity information.");
        }

        // Export option
        if (flags.export) {
          const fs = require("fs");
          const exportData = {
            exported_at: new Date().toISOString(),
            total_logs: logs.length,
            logs: logs.map(log => ({
              ...log,
              entities_promoted: typeof log.entities_promoted === 'string'
                ? JSON.parse(log.entities_promoted)
                : log.entities_promoted
            }))
          };
          
          fs.writeFileSync(flags.export, JSON.stringify(exportData, null, 2));
          console.log(`\nRelease logs exported to: ${flags.export}`);
        }
      });

      this.exit(0);
    } catch (error) {
      console.error("Error:", error.message);
      if (flags.verbose) {
        console.error(error.stack);
      }
      this.exit(1);
    }
  }
}

/**
 * @type {string}
 */
ReleaseLogCommand.description = `View release promotion history and logs`;

/**
 * @type {string}
 */
ReleaseLogCommand.help = `
View the history of release promotions performed with the release-promote command.
Each log entry includes timestamp, source, target, promoted entities, and notes.

Examples:
  # View all release logs
  $ saltcorn release-log

  # View last 10 releases
  $ saltcorn release-log --limit 10

  # View with detailed entity information
  $ saltcorn release-log --verbose

  # Export logs to JSON file
  $ saltcorn release-log --export release-history.json

  # View logs for specific tenant
  $ saltcorn release-log -t production
`;

/**
 * @type {object}
 */
ReleaseLogCommand.flags = {
  tenant: Flags.string({
    char: "t",
    description: "tenant",
  }),
  limit: Flags.integer({
    char: "l",
    description: "Limit number of log entries to display",
  }),
  verbose: Flags.boolean({
    char: "v",
    description: "Show detailed entity information",
    default: false,
  }),
  export: Flags.string({
    char: "e",
    description: "Export logs to JSON file",
  }),
};

module.exports = ReleaseLogCommand;
