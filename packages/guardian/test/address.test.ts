import { describe, expect, it } from "vitest";
import { editDistance, parseAddress } from "../src/address.js";

describe("parseAddress", () => {
  it("pasa a minúsculas y quita la barra final", () => {
    expect(parseAddress("https://ILP.Interledger-Test.dev/Farmacia-Medellin/")).toEqual({
      host: "ilp.interledger-test.dev",
      path: "/farmacia-medellin",
      isHttps: true,
    });
  });

  it("acepta direcciones con $", () => {
    expect(parseAddress("$ilp.interledger-test.dev/farmacia-medellin")).toEqual({
      host: "ilp.interledger-test.dev",
      path: "/farmacia-medellin",
      isHttps: true,
    });
  });

  it("marca isHttps en false para http://", () => {
    expect(parseAddress("http://ilp.interledger-test.dev/farmacia-medellin").isHttps).toBe(false);
  });

  it("no marca isHttps en false para https://", () => {
    expect(parseAddress("https://ilp.interledger-test.dev/x").isHttps).not.toBe(false);
  });
});

describe("editDistance", () => {
  it("es 0 para textos iguales", () => {
    expect(editDistance("farmacia", "farmacia")).toBe(0);
  });

  it("cuenta sustituciones, inserciones y borrados", () => {
    expect(editDistance("kitten", "sitting")).toBe(3);
    expect(editDistance("", "abc")).toBe(3);
  });

  it("no da 0 para textos distintos", () => {
    expect(editDistance("panaderia-centro", "farmacia-medellin")).toBeGreaterThan(2);
  });
});
