/**
 * @category saltcorn-cli
 * @module commands/release-compare
 */
const { Command, Flags, Args } = require("@oclif/core");
const { maybe_as_tenant, init_some_tenants } = require("../common");
const fs = require("fs");
const path = require("path");

/**
 * ReleaseCompareCommand Class
 * Compare two Saltcorn environments or pack files
 * @extends oclif.Command
 * @category saltcorn-cli
 */
class ReleaseCompareCommand extends Command {
  /**
   * Compare two packs and return differences
   * @param {object} source - Source pack
   * @param {object} target - Target pack
   * @returns {object} Differences between source and target
   */
  comparePacks(source, target) {
    const differences = {
      tables: this.compareEntities(source.tables || [], target.tables || [], "name"),
      views: this.compareEntities(source.views || [], target.views || [], "name"),
      pages: this.compareEntities(source.pages || [], target.pages || [], "name"),
      page_groups: this.compareEntities(source.page_groups || [], target.page_groups || [], "name"),
      plugins: this.compareEntities(source.plugins || [], target.plugins || [], "name"),
      triggers: this.compareEntities(source.triggers || [], target.triggers || [], "name"),
      roles: this.compareEntities(source.roles || [], target.roles || [], "id"),
      library: this.compareEntities(source.library || [], target.library || [], "name"),
      tags: this.compareEntities(source.tags || [], target.tags || [], "name"),
      models: this.compareEntities(source.models || [], target.models || [], "name"),
      model_instances: this.compareEntities(source.model_instances || [], target.model_instances || [], "name"),
      code_pages: this.compareEntities(source.code_pages || [], target.code_pages || [], "name"),
    };

    return differences;
  }

  /**
   * Compare entities between source and target
   * @param {Array} sourceEntities - Entities from source
   * @param {Array} targetEntities - Entities from target
   * @param {string} keyField - Field to use as unique identifier
   * @returns {object} Comparison result
   */
  compareEntities(sourceEntities, targetEntities, keyField) {
    const sourceMap = new Map(sourceEntities.map(e => [e[keyField], e]));
    const targetMap = new Map(targetEntities.map(e => [e[keyField], e]));

    const added = [];
    const removed = [];
    const modified = [];
    const unchanged = [];

    // Find added and modified
    for (const [key, sourceEntity] of sourceMap) {
      if (!targetMap.has(key)) {
        added.push({ key, entity: sourceEntity });
      } else {
        const targetEntity = targetMap.get(key);
        if (JSON.stringify(sourceEntity) !== JSON.stringify(targetEntity)) {
          modified.push({ key, source: sourceEntity, target: targetEntity });
        } else {
          unchanged.push(key);
        }
      }
    }

    // Find removed
    for (const [key, targetEntity] of targetMap) {
      if (!sourceMap.has(key)) {
        removed.push({ key, entity: targetEntity });
      }
    }

    return { added, removed, modified, unchanged };
  }

  /**
   * Format differences for display
   * @param {object} differences - Differences object
   * @param {object} flags - Command flags
   * @returns {string} Formatted output
   */
  formatDifferences(differences, flags) {
    const output = [];

    for (const [entityType, diff] of Object.entries(differences)) {
      const hasChanges = diff.added.length > 0 || diff.removed.length > 0 || diff.modified.length > 0;
      
      if (!hasChanges && !flags.verbose) continue;

      output.push(`\n=== ${entityType.toUpperCase()} ===`);
      
      if (diff.added.length > 0) {
        output.push(`\nAdded (${diff.added.length}):`);
        diff.added.forEach(item => {
          output.push(`  + ${item.key}`);
        });
      }

      if (diff.removed.length > 0) {
        output.push(`\nRemoved (${diff.removed.length}):`);
        diff.removed.forEach(item => {
          output.push(`  - ${item.key}`);
        });
      }

      if (diff.modified.length > 0) {
        output.push(`\nModified (${diff.modified.length}):`);
        diff.modified.forEach(item => {
          output.push(`  ~ ${item.key}`);
        });
      }

      if (flags.verbose && diff.unchanged.length > 0) {
        output.push(`\nUnchanged (${diff.unchanged.length}):`);
        diff.unchanged.forEach(key => {
          output.push(`    ${key}`);
        });
      }
    }

    return output.join('\n');
  }

  /**
   * Generate summary statistics
   * @param {object} differences - Differences object
   * @returns {string} Summary statistics
   */
  generateSummary(differences) {
    const summary = {
      added: 0,
      removed: 0,
      modified: 0,
      unchanged: 0
    };

    for (const diff of Object.values(differences)) {
      summary.added += diff.added.length;
      summary.removed += diff.removed.length;
      summary.modified += diff.modified.length;
      summary.unchanged += diff.unchanged.length;
    }

    return `
Summary:
  + Added:     ${summary.added}
  - Removed:   ${summary.removed}
  ~ Modified:  ${summary.modified}
  = Unchanged: ${summary.unchanged}
`;
  }

  /**
   * Load pack from file or current environment
   * @param {string} source - File path or 'current'
   * @param {string} tenant - Tenant name
   * @returns {Promise<object>} Pack object
   */
  async loadPack(source, tenant) {
    if (source === 'current') {
      // Load from current environment
      const { create_pack_json } = require("@saltcorn/admin-models/models/backup");
      await init_some_tenants(tenant);
      
      let pack;
      await maybe_as_tenant(tenant, async () => {
        pack = await create_pack_json(false, false);
      });
      return pack;
    } else {
      // Load from file
      if (!fs.existsSync(source)) {
        throw new Error(`File not found: ${source}`);
      }
      
      const ext = path.extname(source);
      if (ext === '.json') {
        return JSON.parse(fs.readFileSync(source, 'utf8'));
      } else if (ext === '.zip') {
        // Extract pack.json from zip
        const { extract } = require("@saltcorn/admin-models/models/backup");
        const { dir } = require("tmp-promise");
        const tmpDir = await dir({ unsafeCleanup: true });
        
        await extract(source, tmpDir.path);
        const packPath = path.join(tmpDir.path, "pack.json");
        
        if (!fs.existsSync(packPath)) {
          throw new Error("pack.json not found in zip file");
        }
        
        const pack = JSON.parse(fs.readFileSync(packPath, 'utf8'));
        await tmpDir.cleanup();
        return pack;
      } else {
        throw new Error(`Unsupported file format: ${ext}. Use .json or .zip`);
      }
    }
  }

  /**
   * @returns {Promise<void>}
   */
  async run() {
    const { args, flags } = await this.parse(ReleaseCompareCommand);

    try {
      console.log("Loading source pack...");
      const sourcePack = await this.loadPack(args.source, flags.tenant);
      
      console.log("Loading target pack...");
      const targetPack = await this.loadPack(args.target, flags.tenant);

      console.log("\nComparing environments...\n");
      const differences = this.comparePacks(sourcePack, targetPack);

      const output = this.formatDifferences(differences, flags);
      console.log(output);
      console.log(this.generateSummary(differences));

      if (flags.output) {
        const reportData = {
          timestamp: new Date().toISOString(),
          source: args.source,
          target: args.target,
          differences,
          summary: this.generateSummary(differences)
        };
        
        fs.writeFileSync(flags.output, JSON.stringify(reportData, null, 2));
        console.log(`\nComparison report saved to: ${flags.output}`);
      }

      this.exit(0);
    } catch (error) {
      console.error("Error:", error.message);
      this.exit(1);
    }
  }
}

/**
 * @type {string}
 */
ReleaseCompareCommand.description = `Compare two Saltcorn environments or pack files to identify differences`;

/**
 * @type {string}
 */
ReleaseCompareCommand.help = `
Compare two Saltcorn environments or pack files.
You can compare:
- Current environment to a backup file
- Two backup files
- Two different environments (by creating pack exports first)

Examples:
  # Compare current environment to a backup
  $ saltcorn release-compare current backup.zip

  # Compare two backup files
  $ saltcorn release-compare backup1.json backup2.json

  # Save comparison report
  $ saltcorn release-compare current backup.zip -o report.json

  # Show all entities including unchanged
  $ saltcorn release-compare current backup.zip -v
`;

/**
 * @type {object}
 */
ReleaseCompareCommand.args = {
  source: Args.string({
    required: true,
    description: "Source environment ('current') or path to pack file (.json or .zip)",
  }),
  target: Args.string({
    required: true,
    description: "Target environment ('current') or path to pack file (.json or .zip)",
  }),
};

/**
 * @type {object}
 */
ReleaseCompareCommand.flags = {
  tenant: Flags.string({
    char: "t",
    description: "tenant",
  }),
  output: Flags.string({
    char: "o",
    description: "Output file path for comparison report (JSON)",
  }),
  verbose: Flags.boolean({
    char: "v",
    description: "Show all entities including unchanged",
  }),
};

module.exports = ReleaseCompareCommand;
