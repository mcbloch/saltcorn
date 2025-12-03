const request = require("supertest");
const getApp = require("../app");
const {
  getAdminLoginCookie,
  toInclude,
  toSucceed,
  resetToFixtures,
} = require("../auth/testhelp");
const db = require("@saltcorn/data/db");
const { sleep } = require("@saltcorn/data/tests/mocks");

jest.setTimeout(30000);

beforeAll(async () => {
  await resetToFixtures();
});

afterAll(async () => {
  await sleep(200);
  db.close();
});

describe("performance page", () => {
  it("should show performance page for admin", async () => {
    const app = await getApp({ disableCsrf: true });
    const loginCookie = await getAdminLoginCookie();
    await request(app)
      .get("/admin/performance")
      .set("Cookie", loginCookie)
      .expect(toInclude("Performance Overview"));
  });

  it("should show system resources section", async () => {
    const app = await getApp({ disableCsrf: true });
    const loginCookie = await getAdminLoginCookie();
    await request(app)
      .get("/admin/performance")
      .set("Cookie", loginCookie)
      .expect(toInclude("System Resources"));
  });

  it("should show view performance section", async () => {
    const app = await getApp({ disableCsrf: true });
    const loginCookie = await getAdminLoginCookie();
    await request(app)
      .get("/admin/performance")
      .set("Cookie", loginCookie)
      .expect(toInclude("View Performance"));
  });

  it("should show page performance section", async () => {
    const app = await getApp({ disableCsrf: true });
    const loginCookie = await getAdminLoginCookie();
    await request(app)
      .get("/admin/performance")
      .set("Cookie", loginCookie)
      .expect(toInclude("Page Performance"));
  });

  it("should show performance tips section", async () => {
    const app = await getApp({ disableCsrf: true });
    const loginCookie = await getAdminLoginCookie();
    await request(app)
      .get("/admin/performance")
      .set("Cookie", loginCookie)
      .expect(toInclude("Performance Tips"));
  });

  it("should have API endpoint", async () => {
    const app = await getApp({ disableCsrf: true });
    const loginCookie = await getAdminLoginCookie();
    const response = await request(app)
      .get("/admin/performance/api")
      .set("Cookie", loginCookie)
      .expect(toSucceed());
    
    expect(response.body).toHaveProperty("success", true);
    expect(response.body).toHaveProperty("stats");
    expect(response.body.stats).toHaveProperty("views");
    expect(response.body.stats).toHaveProperty("pages");
    expect(response.body.stats).toHaveProperty("totalEvents");
    expect(response.body.stats).toHaveProperty("timeWindow");
  });

  it("should redirect unauthenticated users", async () => {
    const app = await getApp({ disableCsrf: true });
    await request(app)
      .get("/admin/performance")
      .expect(302);
  });
});
