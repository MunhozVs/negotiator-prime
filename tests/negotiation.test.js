import test from "node:test";
import assert from "node:assert/strict";
import { negotiateDiscount } from "../app/services/negotiation.js";

const baseRule = {
  min_discount_percent: 5,
  max_discount_percent: 20,
  counter_strategy: "split_difference",
};

test("accepts requests at or below the minimum configured discount", () => {
  assert.deepEqual(runNegotiation(5), {
    status: "accepted",
    message: "That's a fair price! We accept your offer.",
    finalDiscount: 5,
  });
});

test("rejects requests above the maximum configured discount", () => {
  const result = runNegotiation(30);
  assert.equal(result.status, "rejected");
  assert.equal(result.bestOffer, 20);
});

test("splits the difference for an in-range request", () => {
  const result = runNegotiation(15);
  assert.equal(result.status, "countered");
  assert.equal(result.counterOffer, 10);
});

test("supports a hold-firm strategy", () => {
  const result = negotiateDiscount(
    { ...baseRule, counter_strategy: "hold_firm" },
    15,
  );
  assert.equal(result.counterOffer, 5);
});

test("rejects invalid ranges and request values", () => {
  assert.throws(() => runNegotiation(101), /Invalid negotiation parameters/);
  assert.throws(
    () => negotiateDiscount({ ...baseRule, min_discount_percent: 30 }, 10),
    /Invalid negotiation parameters/,
  );
});

function runNegotiation(requestedDiscount) {
  return negotiateDiscount(baseRule, requestedDiscount);
}
