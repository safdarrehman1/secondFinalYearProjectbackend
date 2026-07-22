const httpStatus = require("http-status");
const {
  assertTransition,
  transitions,
} = require("../order-lifecycle.service");

describe("order lifecycle", () => {
  test("allows the standard delivery lifecycle", () => {
    expect(() => assertTransition("accepted", "delivered")).not.toThrow();
    expect(() => assertTransition("delivered", "revision")).not.toThrow();
    expect(() => assertTransition("revision", "delivered")).not.toThrow();
    expect(() => assertTransition("delivered", "complete")).not.toThrow();
  });

  test("supports disputes without reopening terminal orders", () => {
    expect(() => assertTransition("delivered", "disputed")).not.toThrow();
    expect(() => assertTransition("disputed", "revision")).not.toThrow();
    expect(transitions.complete).toEqual([]);
    expect(transitions.cancel).toEqual([]);
  });

  test("rejects invalid and terminal transitions", () => {
    expect(() => assertTransition("active", "complete")).toThrow(
      expect.objectContaining({ statusCode: httpStatus.CONFLICT }),
    );
    expect(() => assertTransition("complete", "active")).toThrow(
      "Order cannot move from complete to active",
    );
  });

  test("treats repeated status updates as idempotent", () => {
    expect(() => assertTransition("delivered", "delivered")).not.toThrow();
  });
});
