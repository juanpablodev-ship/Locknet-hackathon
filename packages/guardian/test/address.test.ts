import { describe, expect, it } from "vitest";
import { editDistance, normalizeHandle, parseAddress } from "../src/address.js";

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

describe("normalizeHandle", () => {
  it("1→l: farmacia-medel1in queda igual a farmacia-medellin", () => {
    expect(normalizeHandle("farmacia-medel1in")).toBe(normalizeHandle("farmacia-medellin"));
  });

  it("rn→m", () => {
    expect(normalizeHandle("farmacia-rnedellin")).toBe(normalizeHandle("farmacia-medellin"));
  });

  it("homóglifo cirílico (е) → e", () => {
    expect(normalizeHandle("farmacia-med\u0435llin")).toBe(normalizeHandle("farmacia-medellin"));
  });

  it("minúsculas, tildes y NFKC", () => {
    expect(normalizeHandle("FARMACÍA")).toBe("farmacia");
    expect(normalizeHandle("ｆarmacia")).toBe("farmacia");
  });

  it("0→o, 5→s, 3→e, vv→w, |→l", () => {
    expect(normalizeHandle("t0p5-3")).toBe("tops-e");
    expect(normalizeHandle("vvalle")).toBe("walle");
    expect(normalizeHandle("a|a")).toBe("ala");
  });

  it("unifica separadores _ . - en '-'", () => {
    expect(normalizeHandle("mi_tienda.cali")).toBe("mi-tienda-cali");
  });

  it("no iguala handles realmente distintos", () => {
    expect(normalizeHandle("panaderia-centro")).not.toBe(normalizeHandle("farmacia-medellin"));
  });
});
