// Migration to add version column to _sc_pages and _sc_views tables
// This version column is used for optimistic locking to detect concurrent edits

const sql_pg = `
alter table _sc_pages add column "version" integer not null default 1;
alter table _sc_views add column "version" integer not null default 1;
`;

const sql_sqlite = `
alter table _sc_pages add column "version" integer not null default 1;
alter table _sc_views add column "version" integer not null default 1;
`;

module.exports = { sql_pg, sql_sqlite };
