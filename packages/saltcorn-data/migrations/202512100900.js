const sql_pg = `
create table if not exists _sc_release_logs (
  id serial primary key,
  timestamp timestamp not null default now(),
  source text not null,
  target text,
  entities_promoted jsonb,
  notes text,
  promoted_by text
);

create index if not exists _sc_release_logs_timestamp_idx on _sc_release_logs(timestamp desc);
`;

const sql_sqlite = `
create table if not exists _sc_release_logs (
  id integer primary key autoincrement,
  timestamp timestamp not null default CURRENT_TIMESTAMP,
  source text not null,
  target text,
  entities_promoted text,
  notes text,
  promoted_by text
);

create index if not exists _sc_release_logs_timestamp_idx on _sc_release_logs(timestamp desc);
`;

module.exports = { sql_pg, sql_sqlite };
