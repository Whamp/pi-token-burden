import { showReport } from "./report-view.js";

describe("report-view", () => {
  it("exports showReport function", () => {
    expectTypeOf(showReport).toBeFunction();
  });
});
