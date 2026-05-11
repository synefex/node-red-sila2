"use strict";

// Unit tests for the SiLA basic-type unwrap helper.
//
// SiLA encodes every basic type (String, Real, Integer, Boolean, ...) as
// a single-field protobuf message named `value`. The unwrap helper peels
// those wrappers off recursively so callers see native values; it must
// also pass through Structures (multi-field messages), Lists (repeated),
// and primitives unchanged.

const assert = require("assert");
const { unwrap } = require("../src/lib/unwrap");

describe("unwrap()", function () {

  describe("primitives", function () {
    it("passes null through", function () {
      assert.strictEqual(unwrap(null), null);
    });
    it("passes undefined through", function () {
      assert.strictEqual(unwrap(undefined), undefined);
    });
    it("passes strings through", function () {
      assert.strictEqual(unwrap("hello"), "hello");
    });
    it("passes numbers through", function () {
      assert.strictEqual(unwrap(42), 42);
      assert.strictEqual(unwrap(3.14), 3.14);
      assert.strictEqual(unwrap(0), 0);
    });
    it("passes booleans through", function () {
      assert.strictEqual(unwrap(true), true);
      assert.strictEqual(unwrap(false), false);
    });
  });

  describe("SiLA basic-type wrappers (single 'value' field)", function () {
    it("unwraps String", function () {
      assert.strictEqual(unwrap({ value: "S S" }), "S S");
    });
    it("unwraps Real", function () {
      assert.strictEqual(unwrap({ value: 82.6857 }), 82.6857);
    });
    it("unwraps Integer", function () {
      assert.strictEqual(unwrap({ value: 100 }), 100);
    });
    it("unwraps Boolean", function () {
      assert.strictEqual(unwrap({ value: true }), true);
    });
    it("unwraps recursively (wrapped wrapper)", function () {
      // Defensive: should not happen in valid SiLA but the recursion is
      // the simplest implementation, and we want it stable if it does.
      assert.strictEqual(unwrap({ value: { value: 5 } }), 5);
    });
  });

  describe("Structures (multi-field messages)", function () {
    it("unwraps each field of a Structure", function () {
      const input = {
        Status: { value: "S S" },
        WeightValue: { value: 82.6857 },
        Unit: { value: "g" },
      };
      assert.deepStrictEqual(unwrap(input), {
        Status: "S S",
        WeightValue: 82.6857,
        Unit: "g",
      });
    });
    it("preserves multi-field messages without value", function () {
      // A Structure that happens to have multiple fields named otherwise.
      const input = { name: "foo", count: 3 };
      assert.deepStrictEqual(unwrap(input), { name: "foo", count: 3 });
    });
    it("recurses into nested Structures", function () {
      const input = {
        outer: {
          inner: { value: "deep" },
          alsoInner: { value: 1.5 },
        },
      };
      assert.deepStrictEqual(unwrap(input), {
        outer: { inner: "deep", alsoInner: 1.5 },
      });
    });
  });

  describe("Lists (repeated)", function () {
    it("unwraps each element of a List of basic types", function () {
      const input = [{ value: "a" }, { value: "b" }, { value: "c" }];
      assert.deepStrictEqual(unwrap(input), ["a", "b", "c"]);
    });
    it("unwraps List of List of basic types", function () {
      const input = [[{ value: 1 }, { value: 2 }], [{ value: 3 }]];
      assert.deepStrictEqual(unwrap(input), [[1, 2], [3]]);
    });
    it("unwraps List of Structures", function () {
      const input = [
        { name: { value: "alice" }, age: { value: 30 } },
        { name: { value: "bob" }, age: { value: 25 } },
      ];
      assert.deepStrictEqual(unwrap(input), [
        { name: "alice", age: 30 },
        { name: "bob", age: 25 },
      ]);
    });
    it("preserves empty lists", function () {
      assert.deepStrictEqual(unwrap([]), []);
    });
  });

  describe("Buffers and binary data", function () {
    it("passes Buffer through unchanged", function () {
      const buf = Buffer.from([1, 2, 3]);
      assert.strictEqual(unwrap(buf), buf);
    });
    it("passes Uint8Array through unchanged", function () {
      const arr = new Uint8Array([4, 5, 6]);
      assert.strictEqual(unwrap(arr), arr);
    });
    it("does not unwrap a Buffer that happens to look like a wrapper", function () {
      // Defensive: a Buffer exposes various keys but should be treated
      // as binary, not as an object to recurse into.
      const buf = Buffer.from("hello");
      assert.strictEqual(unwrap(buf), buf);
    });
  });

  describe("Real-world SiLA responses", function () {
    it("unwraps Get_ServerName_Responses", function () {
      const input = { ServerName: { value: "MettlerToledoAX205SiLAServer" } };
      assert.deepStrictEqual(unwrap(input), {
        ServerName: "MettlerToledoAX205SiLAServer",
      });
    });
    it("unwraps Get_ImplementedFeatures_Responses (List<String>)", function () {
      const input = {
        ImplementedFeatures: [
          { value: "org.silastandard/core/SiLAService/v1" },
          { value: "master.thesis/weighing/MettlerToledoAX205Controller/v1" },
        ],
      };
      assert.deepStrictEqual(unwrap(input), {
        ImplementedFeatures: [
          "org.silastandard/core/SiLAService/v1",
          "master.thesis/weighing/MettlerToledoAX205Controller/v1",
        ],
      });
    });
    it("unwraps GetStableWeight_Responses", function () {
      const input = {
        Status: { value: "S S" },
        WeightValue: { value: 82.6857 },
        Unit: { value: "g" },
      };
      assert.deepStrictEqual(unwrap(input), {
        Status: "S S",
        WeightValue: 82.6857,
        Unit: "g",
      });
    });
  });
});
