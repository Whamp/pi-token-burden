describe("compare-tokenizers script", () => {
  it("should exist and be loadable", async () => {
    const script = await import("./compare-tokenizers.js");
    expect(script).toBeDefined();
  });
});
