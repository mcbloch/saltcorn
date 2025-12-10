/**
 * @category saltcorn-cli
 * @module commands/release-promote
 */
const { Command, Flags, Args } = require("@oclif/core");
const { maybe_as_tenant, init_some_tenants } = require("../common");
const fs = require("fs");
const path = require("path");

/**
 * ReleasePromoteCommand Class
 * Promote changes from one environment to another with selective options
 * @extends oclif.Command
 * @category saltcorn-cli
 */
class ReleasePromoteCommand extends Command {
  /**
   * Filter pack based on configuration
   * @param {object} pack - Full pack to filter
   * @param {object} config - Configuration specifying what to include
   * @returns {object} Filtered pack
   */
  filterPack(pack, config) {
    const filtered = {};

    const entityTypes = [
      'tables', 'views', 'pages', 'page_groups', 'plugins', 
      'triggers', 'roles', 'library', 'tags', 'models', 
      'model_instances', 'code_pages'
    ];

    for (const entityType of entityTypes) {
      if (config.include && config.include[entityType]) {
        if (config.include[entityType] === 'all') {
          // Include all entities of this type
          filtered[entityType] = pack[entityType] || [];
        } else if (Array.isArray(config.include[entityType])) {
          // Include specific entities
          const entities = pack[entityType] || [];
          const keyField = entityType === 'roles' ? 'id' : 'name';
          filtered[entityType] = entities.filter(e => 
            config.include[entityType].includes(e[keyField])
          );
        }
      } else if (!config.include) {
        // If no include config, include everything
        filtered[entityType] = pack[entityType] || [];
      }
    }

    return filtered;
  }

  /**
   * Load pack from file
   * @param {string} source - File path
   * @returns {Promise<object>} Pack object
   */
  async loadPackFromFile(source) {
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

  /**
   * Load promotion configuration from file
   * @param {string} configPath - Path to config file
   * @returns {object} Configuration object
   */
  loadPromotionConfig(configPath) {
    if (!fs.existsSync(configPath)) {
      throw new Error(`Configuration file not found: ${configPath}`);
    }

    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }

  /**
   * Create default promotion configuration
   * @param {object} pack - Pack to create config for
   * @param {string} outputPath - Path to save config
   */
  createDefaultConfig(pack, outputPath) {
    const config = {
      _comment: "Promotion configuration - specify which entities to promote",
      include: {}
    };

    const entityTypes = [
      'tables', 'views', 'pages', 'page_groups', 'plugins', 
      'triggers', 'library', 'tags', 'models', 
      'model_instances', 'code_pages'
    ];

    for (const entityType of entityTypes) {
      const entities = pack[entityType] || [];
      if (entities.length > 0) {
        const keyField = entityType === 'roles' ? 'id' : 'name';
        config.include[entityType] = entities.map(e => e[keyField]);
        config[`_${entityType}_options`] = [
          "Set to 'all' to include all entities",
          "Or specify array of names to include specific entities",
          "Or remove key to exclude all entities"
        ];
      }
    }

    fs.writeFileSync(outputPath, JSON.stringify(config, null, 2));
    console.log(`Default configuration saved to: ${outputPath}`);
    console.log(`Edit the file to specify which entities to promote.`);
  }

  /**
   * Log promotion activity
   * @param {object} details - Promotion details
   */
  async logPromotion(details) {
    const db = require("@saltcorn/data/db");

    await db.insert("_sc_release_logs", {
      timestamp: new Date(),
      source: details.source,
      target: details.target || "current",
      entities_promoted: details.entities,
      notes: details.notes,
      promoted_by: details.user || process.env.USER || "unknown"
    });
  }

  /**
   * Count entities in pack
   * @param {object} pack - Pack to count
   * @returns {object} Entity counts
   */
  countEntities(pack) {
    const counts = {};
    for (const [type, entities] of Object.entries(pack)) {
      if (Array.isArray(entities)) {
        counts[type] = entities.length;
      }
    }
    return counts;
  }

  /**
   * @returns {Promise<void>}
   */
  async run() {
    const { args, flags } = await this.parse(ReleasePromoteCommand);

    try {
      console.log("Loading source pack...");
      const sourcePack = await this.loadPackFromFile(args.source);

      // Handle config generation
      if (flags.generateConfig) {
        this.createDefaultConfig(sourcePack, flags.generateConfig);
        this.exit(0);
        return;
      }

      // Load promotion config if provided
      let promotionConfig = null;
      if (flags.config) {
        console.log("Loading promotion configuration...");
        promotionConfig = this.loadPromotionConfig(flags.config);
      }

      // Filter pack based on config
      const filteredPack = promotionConfig 
        ? this.filterPack(sourcePack, promotionConfig)
        : sourcePack;

      const counts = this.countEntities(filteredPack);
      console.log("\nEntities to promote:");
      for (const [type, count] of Object.entries(counts)) {
        if (count > 0) {
          console.log(`  ${type}: ${count}`);
        }
      }

      // Dry run mode
      if (flags.dryRun) {
        console.log("\n[DRY RUN] No changes will be made.");
        this.exit(0);
        return;
      }

      // Confirm promotion
      if (!flags.yes) {
        const readline = require('readline').createInterface({
          input: process.stdin,
          output: process.stdout
        });

        const answer = await new Promise((resolve) => {
          readline.question('\nProceed with promotion? (yes/no): ', resolve);
        });
        readline.close();

        if (answer.toLowerCase() !== 'yes') {
          console.log("Promotion cancelled.");
          this.exit(0);
          return;
        }
      }

      // Initialize target tenant
      await init_some_tenants(flags.tenant);

      console.log("\nPromoting changes...");
      
      // Install pack to target environment
      await maybe_as_tenant(flags.tenant, async () => {
        const { install_pack } = require("@saltcorn/admin-models/models/pack");
        const { loadAndSaveNewPlugin } = require("@saltcorn/server/load_plugins");
        
        await install_pack(filteredPack, undefined, loadAndSaveNewPlugin, false);
      });

      console.log("Promotion completed successfully!");

      // Log the promotion
      if (!flags.noLog) {
        console.log("Recording promotion in release log...");
        await maybe_as_tenant(flags.tenant, async () => {
          await this.logPromotion({
            source: args.source,
            target: flags.tenant,
            entities: counts,
            notes: flags.notes || "Automated promotion"
          });
        });
      }

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
ReleasePromoteCommand.description = `Promote changes from one environment to another with selective options`;

/**
 * @type {string}
 */
ReleasePromoteCommand.help = `
Promote changes from a source pack to a target environment.
Supports selective promotion with configuration files and remembers settings.

Examples:
  # Generate a promotion configuration file
  $ saltcorn release-promote source.zip -g promotion-config.json

  # Promote with configuration (dry run)
  $ saltcorn release-promote source.zip -c promotion-config.json --dry-run

  # Promote to production
  $ saltcorn release-promote acceptance.zip -c config.json -t production

  # Promote without confirmation
  $ saltcorn release-promote source.zip -y

  # Promote with release notes
  $ saltcorn release-promote source.zip --notes "Release v2.1.0 - New features"
`;

/**
 * @type {object}
 */
ReleasePromoteCommand.args = {
  source: Args.string({
    required: true,
    description: "Source pack file (.json or .zip) to promote from",
  }),
};

/**
 * @type {object}
 */
ReleasePromoteCommand.flags = {
  tenant: Flags.string({
    char: "t",
    description: "Target tenant to promote to",
  }),
  config: Flags.string({
    char: "c",
    description: "Path to promotion configuration file (JSON)",
  }),
  generateConfig: Flags.string({
    char: "g",
    description: "Generate a default promotion configuration file and exit",
  }),
  dryRun: Flags.boolean({
    char: "d",
    description: "Perform a dry run without making changes",
    default: false,
  }),
  yes: Flags.boolean({
    char: "y",
    description: "Skip confirmation prompt",
    default: false,
  }),
  notes: Flags.string({
    char: "n",
    description: "Release notes to include in the log",
  }),
  noLog: Flags.boolean({
    description: "Skip logging to release log",
    default: false,
  }),
  verbose: Flags.boolean({
    char: "v",
    description: "Verbose error output",
    default: false,
  }),
};

module.exports = ReleasePromoteCommand;
