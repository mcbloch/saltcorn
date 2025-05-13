import Table from "../models/table";
import TableConstraint from "../models/table_constraints";
import Field from "../models/field";
import View from "../models/view";
import db from "../db";
const { getState } = require("../db/state");
getState().registerPlugin("base", require("../base-plugin"));
import { writeFile } from "fs/promises";
import mocks from "./mocks";
const { rick_file, plugin_with_routes, mockReqRes, createDefaultView } = mocks;
import {
  assertIsSet,
  assertsIsSuccessMessage,
  assertIsErrorMsg,
  assertIsType,
} from "./assertions";
import { afterAll, beforeAll, describe, it, expect } from "@jest/globals";
import { add_free_variables_to_joinfields } from "../plugin-helper";
import expressionModule from "../models/expression";
import { text } from "stream/consumers";
import utils from "../utils";
import User from "../models/user";
const { freeVariables } = expressionModule;

afterAll(db.close);
beforeAll(async () => {
  await require("../db/reset_schema")();
  await require("../db/fixtures")();
});
jest.setTimeout(30000);

describe("Table history", () => {
  it("should enable versioning", async () => {
    const table = Table.findOne({ name: "patients" });
    assertIsSet(table);
    table.versioned = true;
    await table.update(table);
    const vtables = await Table.find({ versioned: true });
    expect(vtables.map((t) => t.name)).toContain("patients");
  });
  it("should save version on insert", async () => {
    const table = Table.findOne({ name: "patients" });
    assertIsSet(table);
    await table.insertRow({ name: "Bunny foo-foo", favbook: 1 });
    const bunnyFooFoo = await table.getRow({ name: "Bunny foo-foo" });
    assertIsSet(bunnyFooFoo);
    const history1 = await table.get_history(bunnyFooFoo.id);
    expect(history1.length).toBe(1);
    expect(history1[0].id).toBe(bunnyFooFoo.id);
    expect(history1[0]._version).toBe(1);
    expect(history1[0].name).toBe("Bunny foo-foo");
  });
  it("should save version on update", async () => {
    const table = Table.findOne({ name: "patients" });
    assertIsSet(table);

    const bunnyFooFoo = await table.getRow({ name: "Bunny foo-foo" });
    assertIsSet(bunnyFooFoo);

    await table.updateRow({ name: "Goon" }, bunnyFooFoo.id);
    const history2 = await table.get_history(bunnyFooFoo.id);
    expect(history2.length).toBe(2);
    expect(history2[0].id).toBe(bunnyFooFoo.id);
    expect(history2[0]._version).toBe(1);
    expect(history2[0].name).toBe("Bunny foo-foo");
    expect(history2[0].favbook).toBe(1);
    expect(history2[1].id).toBe(bunnyFooFoo.id);
    expect(history2[1]._version).toBe(2);
    expect(history2[1].name).toBe("Goon");
    expect(history2[1].favbook).toBe(1);
    const goon = await table.getRow({ id: bunnyFooFoo.id });
    assertIsSet(goon);
    expect(goon.name).toBe("Goon");
    expect(goon.favbook).toBe(1);
  });
  it("create field on version table", async () => {
    const table = Table.findOne({ name: "patients" });

    const fc = await Field.create({
      table: table,
      name: "Height19",
      label: "height19",
      type: "Integer",
      required: true,
      attributes: { default: 6 },
    });
    await fc.delete();
  });
  it("should disable versioning", async () => {
    const table = Table.findOne({ name: "patients" });
    assertIsSet(table);
    table.getFields();
    await table.update({ versioned: false });
  });
  it("should rename", async () => {
    const table = await Table.create("notsurename");
    await Field.create({
      table,
      label: "tall",
      type: "Bool",
      required: true,
    });
    const table1 = await Table.create("refsunsure");
    await Field.create({
      table: table1,
      label: "also_tall",
      type: "Bool",
      required: true,
    });
    await Field.create({
      table: table1,
      label: "theref",
      type: "Key to notsurename",
      required: true,
    });
    const id = await table.insertRow({ tall: false });
    await table1.insertRow({ also_tall: true, theref: id });
    const joinFields = { reftall: { ref: "theref", target: "tall" } };
    const rows = await table1.getJoinedRows({ joinFields });
    expect(rows[0].theref).toBe(id);
    expect(!!rows[0].reftall).toBe(false); //for sqlite
    if (!db.isSQLite) {
      await table.rename("isthisbetter");
      const table3 = Table.findOne({ name: "refsunsure" });
      assertIsSet(table3);
      const rows1 = await table3.getJoinedRows({ joinFields });
      expect(rows1[0].theref).toBe(id);
      expect(rows1[0].reftall).toBe(false);
      const table2 = Table.findOne({ name: "isthisbetter" });
      assertIsSet(table2);
      expect(!!table2).toBe(true);
      table2.versioned = true;
      await table2.update(table2);
      await table2.rename("thisisthebestname");
    }
  });
});

describe("undo/redo", () => {
  it("should create table", async () => {
    const tc = await Table.create("counttable23");

    await Field.create({
      table: tc,
      label: "Number",
      type: "Integer",
      required: true,
    });
    await tc.update({ versioned: true });
    await tc.insertRow({ id: 1, number: 101 });

    await tc.updateRow({ number: 102 }, 1);
    await tc.updateRow({ number: 103 }, 1);
    await tc.updateRow({ number: 104 }, 1);
    await tc.updateRow({ number: 105 }, 1);
  });
  it("should undo", async () => {
    const tc = Table.findOne({ name: "counttable23" });
    assertIsSet(tc);
    //db.set_sql_logging(true);
    await tc.undo_row_changes(1);
    const r1 = await tc.getRow({ id: 1 });
    expect(r1?.number).toBe(104);
    //console.log(await tc.get_history(1));
  });
  it("should undo again", async () => {
    const tc = Table.findOne({ name: "counttable23" });
    assertIsSet(tc);
    //db.set_sql_logging(true);
    await tc.undo_row_changes(1);

    const r2 = await tc.getRow({ id: 1 });
    expect(r2?.number).toBe(103);
  });
  it("should redo", async () => {
    const tc = Table.findOne({ name: "counttable23" });
    assertIsSet(tc);

    await tc.redo_row_changes(1);

    const r2 = await tc.getRow({ id: 1 });
    expect(r2?.number).toBe(104);
  });
  it("should redo again", async () => {
    const tc = Table.findOne({ name: "counttable23" });
    assertIsSet(tc);

    await tc.redo_row_changes(1);

    const r2 = await tc.getRow({ id: 1 });
    expect(r2?.number).toBe(105);
  });
  it("should undo after redo", async () => {
    const tc = Table.findOne({ name: "counttable23" });
    assertIsSet(tc);

    await tc.undo_row_changes(1);

    const r2 = await tc.getRow({ id: 1 });
    expect(r2?.number).toBe(104);
  });
});
describe("history compression", () => {
  it("should compress by time", async () => {
    if (!db.isSQLite) {
      const tc = await Table.create("counttable32");

      await Field.create({
        table: tc,
        label: "Number",
        type: "Integer",
        required: true,
      });
      await tc.update({ versioned: true });
      await tc.insertRow({ id: 1, number: 101 });
      await tc.insertRow({ id: 2, number: 201 });

      await tc.updateRow({ number: 102 }, 1);
      await tc.updateRow({ number: 103 }, 1);
      await tc.updateRow({ number: 202 }, 2);
      await utils.sleep(600);
      await tc.updateRow({ number: 104 }, 1);
      await tc.updateRow({ number: 205 }, 2);
      const h1 = await tc.get_history(1);
      expect(h1.length).toBe(4);
      expect(h1.map((h) => h.number)).toContain(101);
      expect(h1.map((h) => h.number)).toContain(102);
      const h2 = await tc.get_history(2);
      expect(h2.length).toBe(3);
      expect(h2.map((h) => h.number)).toContain(202);

      await tc.compress_history(0.2);

      const h1c = await tc.get_history(1);
      expect(h1c.length).toBe(2);
      expect(h1c.map((h) => h.number)).toContain(103);
      expect(h1c.map((h) => h.number)).toContain(104);
      const h2c = await tc.get_history(2);
      expect(h2c.length).toBe(2);
      expect(h2c.map((h) => h.number)).toContain(202);
      expect(h2c.map((h) => h.number)).toContain(205);
    }
  });
  it("should delete unchanged", async () => {
    if (!db.isSQLite) {
      const tc = await Table.create("counttable33");

      await Field.create({
        table: tc,
        label: "Number",
        type: "Integer",
        required: true,
      });
      await tc.update({ versioned: true });
      await tc.insertRow({ id: 1, number: 101 });
      await tc.insertRow({ id: 2, number: 201 });

      await tc.updateRow({ number: 101 }, 1);
      await tc.updateRow({ number: 101 }, 1);
      await tc.updateRow({ number: 202 }, 2);
      await tc.updateRow({ number: 102 }, 1);
      await tc.updateRow({ number: 103 }, 1);

      const h1 = await tc.get_history(1);
      expect(h1.length).toBe(5);
      expect(h1.map((h) => h.number)).toContain(101);
      expect(h1.map((h) => h.number)).toContain(102);
      const h2 = await tc.get_history(2);
      expect(h2.length).toBe(2);
      expect(h2.map((h) => h.number)).toContain(202);

      await tc.compress_history({ delete_unchanged: true });
      db.set_sql_logging(false);

      const h1c = await tc.get_history(1);
      expect(h1c.length).toBe(3);
      expect(h1c.map((h) => h.number)).toContain(101);
      expect(h1c.filter((h) => h.number === 101).length).toBe(1);
      expect(h1c.map((h) => h.number)).toContain(102);
      expect(h1c.map((h) => h.number)).toContain(103);
      const h2c = await tc.get_history(2);
      expect(h2c.length).toBe(2);
      expect(h2c.map((h) => h.number)).toContain(201);
      expect(h2c.map((h) => h.number)).toContain(202);
    }
  });
});
describe("unique history clash", () => {
  it("should create table", async () => {
    const table = await Table.create("unihistory");

    await Field.create({
      table,
      label: "Name",
      type: "String",
      is_unique: true,
    });
    await Field.create({
      table,
      label: "age",
      type: "Integer",
    });
    await Field.create({
      table,
      label: "agep1",
      type: "Integer",
      calculated: true,
      stored: true,
      expression: "age ? age+1:null",
    });
    await Field.create({
      table,
      label: "agep1ns",
      type: "Integer",
      calculated: true,
      stored: false,
      expression: "age ? age+1:null",
    });
  });
  it("should enable versioning", async () => {
    const table = Table.findOne({ name: "unihistory" });
    assertIsSet(table);
    table.versioned = true;
    await table.update(table);
  });
  it("should not error on history with unique", async () => {
    const table = Table.findOne({ name: "unihistory" });
    assertIsSet(table);

    await table.insertRow({ name: "Bartimaeus", age: 2500 });
    const row = await table.getRow({ name: "Bartimaeus" });
    expect(row!.name).toBe("Bartimaeus");
    await table.deleteRows({ id: row!.id });
    await table.insertRow({ name: "Bartimaeus" });
    const row1 = await table.getRow({ name: "Bartimaeus" });
    expect(row1!.name).toBe("Bartimaeus");
  });
  it("should duplicate row manually", async () => {
    const table = Table.findOne({ name: "unihistory" });
    assertIsSet(table);

    const row = await table.getRow({ name: "Bartimaeus" });
    assertIsSet(row);
    const history0 = await table.get_history(row.id);

    await table.updateRow({ age: 2501 }, row.id);
    const row1 = await table.getRow({ name: "Bartimaeus" });
    expect(row1!.name).toBe("Bartimaeus");
    expect(row1!.age).toBe(2501);
    const history1 = await table.get_history(row1!.id);
    expect(history0.length + 1).toBe(history1.length);
  });
  it("should not clash unique with history", async () => {
    const table = Table.findOne({ name: "unihistory" });
    assertIsSet(table);

    const row = await table.getRow({ name: "Bartimaeus" });
    assertIsSet(row);
    await table.deleteRows({});
    await table.insertRow({ name: "Bartimaeus", age: 2499 });
  });
  it("should disable and enable history", async () => {
    const table = Table.findOne({ name: "unihistory" });
    assertIsSet(table);
    table.versioned = false;
    await table.update(table);
    table.versioned = true;
    await table.update(table);
    const row = await table.getRow({ name: "Bartimaeus" });
    assertIsSet(row);

    await table.updateRow({ age: 2502 }, row.id);
    const row1 = await table.getRow({ name: "Bartimaeus" });
    expect(row1!.name).toBe("Bartimaeus");
    expect(row1!.age).toBe(2502);
    await table.deleteRows({});
    await table.insertRow({ name: "Bartimaeus", age: 2498 });
  });
});

describe("Table history with UUID pks", () => {
  if (!db.isSQLite) {
    it("should select uuid", async () => {
      await db.query('create extension if not exists "uuid-ossp";');

      const { rows } = await db.query("select uuid_generate_v4();");
      expect(rows.length).toBe(1);
      expect(typeof rows[0].uuid_generate_v4).toBe("string");
    });
    it("should create table", async () => {
      getState().registerPlugin("mock_plugin", plugin_with_routes());
      const table = await Table.create("TableUUID1");
      const [pk] = table.getFields();
      await pk.update({ type: "UUID" });
      // @ts-ignore
      expect(pk.type.name).toBe("UUID");
      table.versioned = true;
      await table.update(table);
    });
    it("should insert stuff in table", async () => {
      const table1 = Table.findOne({ name: "TableUUID1" });
      assertIsSet(table1);
      const flds1 = await table1.getFields();

      // @ts-ignore
      expect(flds1[0].type.name).toBe("UUID");

      const name = await Field.create({
        table: table1,
        name: "name",
        type: "String",
      });

      await table1.insertRow({ name: "Sam" });
      const rows = await table1.getRows();
      expect(rows.length).toBe(1);
      expect(typeof rows[0].id).toBe("string");
      expect(rows[0].id.length > 10).toBe(true);
      expect(rows[0].name).toBe("Sam");

      const history1 = await table1.get_history(rows[0].id);
      expect(history1.length).toBe(1);

      await table1.updateRow({ name: "Jim" }, rows[0].id);
      const rows1 = await table1.getJoinedRows();
      expect(rows1.length).toBe(1);
      expect(typeof rows1[0].id).toBe("string");
      expect(rows1[0].id).toBe(rows[0].id);
      expect(rows1[0].name).toBe("Jim");
      const row = await table1.getRow({ id: rows[0].id });
      assertIsSet(row);
      expect(row.name).toBe("Jim");
      const history2 = await table1.get_history(rows[0].id);
      expect(history2.length).toBe(2);
    });
  }
});

describe("Users history", () => {
  it("should enable versioning", async () => {
    const table = User.table;
    assertIsSet(table);
    table.versioned = true;
    await table.update(table);
  });
  it("should insert stuff in table", async () => {
    const u = await User.findOne({ id: 3 });
    assertIsSet(u);

    await u.update({ email: "foo@bar.com" });
    const u1 = await User.findOne({ id: 3 });
    assertIsSet(u1);
    expect(u1.email).toBe("foo@bar.com");
    await u1.update({ last_mobile_login: new Date() });
  });
});
