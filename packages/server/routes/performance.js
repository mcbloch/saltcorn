/**
 * Performance Analysis Routes
 * @category server
 * @module routes/performance
 * @subcategory routes
 */
const Router = require("express-promise-router");
const { isAdmin, error_catcher, get_sys_info } = require("./utils.js");
const { getState, get_process_init_time } = require("@saltcorn/data/db/state");
const db = require("@saltcorn/data/db");
const { mkTable, localeDateTime } = require("@saltcorn/markup");
const {
  div,
  a,
  h4,
  h5,
  table,
  tbody,
  thead,
  td,
  th,
  tr,
  p,
  span,
  pre,
  text,
  i,
  small,
  ul,
  li,
} = require("@saltcorn/markup/tags");
const { send_admin_page } = require("../markup/admin.js");
const EventLog = require("@saltcorn/data/models/eventlog");
const View = require("@saltcorn/data/models/view");
const Page = require("@saltcorn/data/models/page");

/**
 * @type {object}
 * @const
 * @namespace performanceRouter
 * @category server
 * @subcategory routes
 */
const router = new Router();
module.exports = router;

/**
 * Get performance statistics from EventLog
 * @returns {Promise<object>}
 */
const getPerformanceStats = async () => {
  const schema = db.getTenantSchemaPrefix();
  
  // Get page/view load events with render_time from the last 24 hours
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  // Get recent PageLoad events
  const recentEvents = await EventLog.find(
    { event_type: "PageLoad", occur_at: { gt: oneDayAgo } },
    { orderBy: "occur_at", orderDesc: true, limit: 1000 }
  );

  // Parse and aggregate stats
  const viewStats = {};
  const pageStats = {};
  
  for (const event of recentEvents) {
    if (!event.payload) continue;
    
    const { type, name, render_time } = event.payload;
    if (!name || render_time === undefined) continue;
    
    const stats = type === "view" ? viewStats : pageStats;
    
    if (!stats[name]) {
      stats[name] = {
        name,
        count: 0,
        totalTime: 0,
        minTime: Infinity,
        maxTime: 0,
        times: [],
      };
    }
    
    stats[name].count++;
    stats[name].totalTime += render_time;
    stats[name].minTime = Math.min(stats[name].minTime, render_time);
    stats[name].maxTime = Math.max(stats[name].maxTime, render_time);
    stats[name].times.push(render_time);
  }

  // Calculate averages and percentiles
  const calculateStats = (statsObj) => {
    return Object.values(statsObj).map((stat) => {
      const sorted = stat.times.sort((a, b) => a - b);
      const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
      const p90 = sorted[Math.floor(sorted.length * 0.9)] || 0;
      const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;
      
      return {
        name: stat.name,
        count: stat.count,
        avgTime: Math.round(stat.totalTime / stat.count * 100) / 100,
        minTime: stat.minTime === Infinity ? 0 : stat.minTime,
        maxTime: stat.maxTime,
        p50: Math.round(p50 * 100) / 100,
        p90: Math.round(p90 * 100) / 100,
        p99: Math.round(p99 * 100) / 100,
      };
    }).sort((a, b) => b.avgTime - a.avgTime);
  };

  return {
    views: calculateStats(viewStats),
    pages: calculateStats(pageStats),
    totalEvents: recentEvents.length,
    timeWindow: "24 hours",
  };
};

/**
 * Get slow page/view requests
 * @param {number} threshold - Minimum render time in ms to consider "slow"
 * @returns {Promise<Array>}
 */
const getSlowRequests = async (threshold = 1000) => {
  const schema = db.getTenantSchemaPrefix();
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  const recentEvents = await EventLog.find(
    { event_type: "PageLoad", occur_at: { gt: oneDayAgo } },
    { orderBy: "occur_at", orderDesc: true, limit: 1000 }
  );

  return recentEvents
    .filter((event) => event.payload?.render_time >= threshold)
    .map((event) => ({
      id: event.id,
      type: event.payload?.type || "unknown",
      name: event.payload?.name || "unknown",
      render_time: event.payload?.render_time,
      occur_at: event.occur_at,
      query: event.payload?.query,
    }))
    .slice(0, 50);
};

/**
 * Format milliseconds with color coding
 * @param {number} ms
 * @returns {string}
 */
const formatTime = (ms) => {
  if (ms === undefined || ms === null) return "-";
  const rounded = Math.round(ms * 100) / 100;
  let colorClass = "text-success";
  if (ms > 500) colorClass = "text-warning";
  if (ms > 1000) colorClass = "text-danger";
  return span({ class: colorClass }, `${rounded} ms`);
};

/**
 * @name get/
 * @function
 * @memberof module:routes/performance~performanceRouter
 * @function
 */
router.get(
  "/",
  isAdmin,
  error_catcher(async (req, res) => {
    const stats = await getPerformanceStats();
    const slowRequests = await getSlowRequests(500);
    const locale = getState().getConfig("default_locale", "en");
    
    // Get system info
    let sysInfo = { memUsage: 0, diskUsage: 0, cpuUsage: 0 };
    try {
      sysInfo = await get_sys_info();
    } catch (e) {
      // System info might not be available in some environments
    }
    
    // Get uptime
    const processInitTime = get_process_init_time();
    const uptimeMs = processInitTime ? Date.now() - processInitTime.getTime() : 0;
    const uptimeHours = Math.floor(uptimeMs / (1000 * 60 * 60));
    const uptimeMins = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
    
    // Get database pool stats if available
    let poolStats = { totalCount: 0, idleCount: 0, waitingCount: 0 };
    try {
      const pool = db.pool;
      if (pool) {
        poolStats = {
          totalCount: pool.totalCount || 0,
          idleCount: pool.idleCount || 0,
          waitingCount: pool.waitingCount || 0,
        };
      }
    } catch (e) {
      // Pool stats might not be available
    }

    const viewsTable = stats.views.length > 0
      ? mkTable(
          [
            { label: req.__("View Name"), key: (r) => a({ href: `/admin/performance/detail/view/${encodeURIComponent(r.name)}` }, r.name) },
            { label: req.__("Requests"), key: "count", align: "right" },
            { label: req.__("Avg (ms)"), key: (r) => formatTime(r.avgTime), align: "right" },
            { label: req.__("Min (ms)"), key: (r) => formatTime(r.minTime), align: "right" },
            { label: req.__("Max (ms)"), key: (r) => formatTime(r.maxTime), align: "right" },
            { label: req.__("P50 (ms)"), key: (r) => formatTime(r.p50), align: "right" },
            { label: req.__("P90 (ms)"), key: (r) => formatTime(r.p90), align: "right" },
            { label: req.__("P99 (ms)"), key: (r) => formatTime(r.p99), align: "right" },
          ],
          stats.views
        )
      : p({ class: "text-muted" }, req.__("No view performance data available"));

    const pagesTable = stats.pages.length > 0
      ? mkTable(
          [
            { label: req.__("Page Name"), key: (r) => a({ href: `/admin/performance/detail/page/${encodeURIComponent(r.name)}` }, r.name) },
            { label: req.__("Requests"), key: "count", align: "right" },
            { label: req.__("Avg (ms)"), key: (r) => formatTime(r.avgTime), align: "right" },
            { label: req.__("Min (ms)"), key: (r) => formatTime(r.minTime), align: "right" },
            { label: req.__("Max (ms)"), key: (r) => formatTime(r.maxTime), align: "right" },
            { label: req.__("P50 (ms)"), key: (r) => formatTime(r.p50), align: "right" },
            { label: req.__("P90 (ms)"), key: (r) => formatTime(r.p90), align: "right" },
            { label: req.__("P99 (ms)"), key: (r) => formatTime(r.p99), align: "right" },
          ],
          stats.pages
        )
      : p({ class: "text-muted" }, req.__("No page performance data available"));

    const slowTable = slowRequests.length > 0
      ? mkTable(
          [
            { label: req.__("When"), key: (r) => a({ href: `/eventlog/${r.id}` }, localeDateTime(r.occur_at, {}, locale)) },
            { label: req.__("Type"), key: "type" },
            { label: req.__("Name"), key: "name" },
            { label: req.__("Render Time"), key: (r) => formatTime(r.render_time), align: "right" },
            { label: req.__("Query"), key: (r) => r.query ? pre({ style: "max-width: 300px; overflow: auto; font-size: 0.8em;" }, text(JSON.stringify(r.query))) : "-" },
          ],
          slowRequests
        )
      : p({ class: "text-muted" }, req.__("No slow requests in the last 24 hours"));

    const enableEventLoggingInfo = stats.totalEvents === 0
      ? div(
          { class: "alert alert-info" },
          i({ class: "fas fa-info-circle me-2" }),
          req.__("To collect performance data, enable PageLoad event logging in "),
          a({ href: "/eventlog/settings" }, req.__("Event settings")),
          "."
        )
      : "";
    
    // System metrics card
    const sysMetricsCard = {
      type: "card",
      title: req.__("System Resources"),
      contents: div(
        { class: "row" },
        div(
          { class: "col-md-3" },
          div(
            { class: "card bg-light mb-3" },
            div(
              { class: "card-body text-center" },
              h5({ class: "card-title" }, req.__("CPU Usage")),
              h4({ class: sysInfo.cpuUsage > 80 ? "text-danger" : sysInfo.cpuUsage > 60 ? "text-warning" : "text-success" }, 
                `${sysInfo.cpuUsage}%`)
            )
          )
        ),
        div(
          { class: "col-md-2" },
          div(
            { class: "card bg-light mb-3" },
            div(
              { class: "card-body text-center" },
              h5({ class: "card-title" }, req.__("Memory Usage")),
              h4({ class: sysInfo.memUsage > 90 ? "text-danger" : sysInfo.memUsage > 70 ? "text-warning" : "text-success" }, 
                `${sysInfo.memUsage}%`)
            )
          )
        ),
        div(
          { class: "col-md-2" },
          div(
            { class: "card bg-light mb-3" },
            div(
              { class: "card-body text-center" },
              h5({ class: "card-title" }, req.__("Disk Usage")),
              h4({ class: sysInfo.diskUsage > 90 ? "text-danger" : sysInfo.diskUsage > 70 ? "text-warning" : "text-success" }, 
                `${sysInfo.diskUsage}%`)
            )
          )
        ),
        div(
          { class: "col-md-2" },
          div(
            { class: "card bg-light mb-3" },
            div(
              { class: "card-body text-center" },
              h5({ class: "card-title" }, req.__("Server Uptime")),
              h4(`${uptimeHours}h ${uptimeMins}m`)
            )
          )
        ),
        div(
          { class: "col-md-4" },
          div(
            { class: "card bg-light mb-3" },
            div(
              { class: "card-body text-center" },
              h5({ class: "card-title" }, req.__("DB Pool")),
              h4(
                small(req.__("Total: ")), poolStats.totalCount, " ",
                small(req.__("Idle: ")), poolStats.idleCount, " ",
                small(req.__("Wait: ")), poolStats.waitingCount
              )
            )
          )
        )
      ),
    };

    send_admin_page({
      res,
      req,
      active_sub: "Performance",
      contents: {
        above: [
          enableEventLoggingInfo,
          sysMetricsCard,
          {
            type: "card",
            title: req.__("Performance Overview"),
            contents: div(
              p(
                req.__("Data from the last %s. Total PageLoad events: %s", stats.timeWindow, stats.totalEvents)
              ),
              div(
                { class: "row" },
                div(
                  { class: "col-md-4" },
                  div(
                    { class: "card bg-light mb-3" },
                    div(
                      { class: "card-body text-center" },
                      h5({ class: "card-title" }, req.__("Views Tracked")),
                      h4(stats.views.length)
                    )
                  )
                ),
                div(
                  { class: "col-md-4" },
                  div(
                    { class: "card bg-light mb-3" },
                    div(
                      { class: "card-body text-center" },
                      h5({ class: "card-title" }, req.__("Pages Tracked")),
                      h4(stats.pages.length)
                    )
                  )
                ),
                div(
                  { class: "col-md-4" },
                  div(
                    { class: "card bg-light mb-3" },
                    div(
                      { class: "card-body text-center" },
                      h5({ class: "card-title" }, req.__("Slow Requests (>500ms)")),
                      h4({ class: slowRequests.length > 0 ? "text-warning" : "" }, slowRequests.length)
                    )
                  )
                )
              )
            ),
          },
          {
            type: "card",
            title: req.__("View Performance (sorted by avg render time)"),
            contents: viewsTable,
          },
          {
            type: "card",
            title: req.__("Page Performance (sorted by avg render time)"),
            contents: pagesTable,
          },
          {
            type: "card",
            title: req.__("Recent Slow Requests (>500ms)"),
            contents: slowTable,
          },
          {
            type: "card",
            title: req.__("Performance Tips"),
            contents: div(
              { class: "alert alert-light" },
              h5({ class: "alert-heading" }, i({ class: "fas fa-lightbulb me-2" }), req.__("Recommendations")),
              ul(
                li(req.__("Enable PageLoad event logging to collect performance data.")),
                li(req.__("Views/pages with avg render time > 500ms may need optimization.")),
                li(req.__("Check slow requests to identify specific problematic queries.")),
                li(req.__("Consider caching for frequently accessed views with high render times.")),
                li(req.__("Monitor CPU and memory usage for system-level bottlenecks.")),
                li(req.__("High DB pool waiting count may indicate connection pool exhaustion."))
              ),
              p(
                { class: "mb-0" },
                small(
                  req.__("Color coding: "),
                  span({ class: "text-success me-2" }, req.__("Green < 500ms (good)")),
                  span({ class: "text-warning me-2" }, req.__("Yellow 500-1000ms (moderate)")),
                  span({ class: "text-danger" }, req.__("Red > 1000ms (slow)"))
                )
              )
            ),
          },
        ],
      },
    });
  })
);

/**
 * API endpoint for performance data
 * @name get/api
 * @function
 * @memberof module:routes/performance~performanceRouter
 * @function
 */
router.get(
  "/api",
  isAdmin,
  error_catcher(async (req, res) => {
    const stats = await getPerformanceStats();
    const slowRequests = await getSlowRequests(parseInt(req.query.threshold) || 500);
    
    res.json({
      success: true,
      stats,
      slowRequests,
    });
  })
);

/**
 * Get performance data for a specific view or page
 * @name get/detail/:type/:name
 * @function
 * @memberof module:routes/performance~performanceRouter
 * @function
 */
router.get(
  "/detail/:type/:name",
  isAdmin,
  error_catcher(async (req, res) => {
    const { type, name } = req.params;
    const locale = getState().getConfig("default_locale", "en");
    
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const events = await EventLog.find(
      { event_type: "PageLoad", occur_at: { gt: oneDayAgo } },
      { orderBy: "occur_at", orderDesc: true, limit: 1000 }
    );

    const filteredEvents = events
      .filter((e) => e.payload?.type === type && e.payload?.name === name)
      .map((e) => ({
        id: e.id,
        occur_at: e.occur_at,
        render_time: e.payload?.render_time,
        query: e.payload?.query,
        user_id: e.user_id,
      }));

    const times = filteredEvents.map((e) => e.render_time).filter((t) => t !== undefined);
    const avgTime = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;
    const minTime = times.length > 0 ? Math.min(...times) : 0;
    const maxTime = times.length > 0 ? Math.max(...times) : 0;

    const eventsTable = mkTable(
      [
        { label: req.__("When"), key: (r) => a({ href: `/eventlog/${r.id}` }, localeDateTime(r.occur_at, {}, locale)) },
        { label: req.__("Render Time"), key: (r) => formatTime(r.render_time), align: "right" },
        { label: req.__("User ID"), key: (r) => r.user_id || req.__("Anonymous") },
        { label: req.__("Query"), key: (r) => r.query ? pre({ style: "max-width: 400px; overflow: auto; font-size: 0.8em;" }, text(JSON.stringify(r.query))) : "-" },
      ],
      filteredEvents.slice(0, 100)
    );

    send_admin_page({
      res,
      req,
      active_sub: "Performance",
      sub2_page: `${type}: ${name}`,
      contents: {
        above: [
          {
            type: "card",
            title: req.__("Performance Details: %s %s", type, name),
            contents: div(
              div(
                { class: "row mb-3" },
                div(
                  { class: "col-md-3" },
                  div(
                    { class: "card bg-light" },
                    div(
                      { class: "card-body text-center" },
                      h5({ class: "card-title" }, req.__("Total Requests")),
                      h4(filteredEvents.length)
                    )
                  )
                ),
                div(
                  { class: "col-md-3" },
                  div(
                    { class: "card bg-light" },
                    div(
                      { class: "card-body text-center" },
                      h5({ class: "card-title" }, req.__("Avg Time")),
                      h4(formatTime(avgTime))
                    )
                  )
                ),
                div(
                  { class: "col-md-3" },
                  div(
                    { class: "card bg-light" },
                    div(
                      { class: "card-body text-center" },
                      h5({ class: "card-title" }, req.__("Min Time")),
                      h4(formatTime(minTime))
                    )
                  )
                ),
                div(
                  { class: "col-md-3" },
                  div(
                    { class: "card bg-light" },
                    div(
                      { class: "card-body text-center" },
                      h5({ class: "card-title" }, req.__("Max Time")),
                      h4(formatTime(maxTime))
                    )
                  )
                )
              ),
              h5(req.__("Recent Requests (last 100)")),
              eventsTable
            ),
          },
        ],
      },
    });
  })
);
