import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import vm from "node:vm";

async function loadCatalog() {
  const source = await readFile(resolve(import.meta.dirname, "../scripts/products.js"), "utf8");
  const context = { window: {} };
  vm.runInNewContext(source, context, { filename: "products.js" });
  return context.window.DA_CHEF_PRODUCTS;
}

test("all catalog galleries point to existing local images", async () => {
  const products = await loadCatalog();
  for (const product of products) {
    const variants = product.variants || [{ colors: product.colors }];
    for (const variant of variants) {
      for (const color of variant.colors) {
        assert.ok(color.images.length >= 4, `${product.name}: галерея ${color.label} содержит меньше четырех фото`);
        for (const image of color.images) {
          assert.match(image, /^assets\/products\//);
          await access(resolve(import.meta.dirname, "..", image));
        }
      }
    }
  }
});

test("all jacket models expose long and short sleeve variants", async () => {
  const products = await loadCatalog();
  for (const productId of ["edge", "daily", "line"]) {
    const product = products.find((candidate) => candidate.id === productId);
    assert.deepEqual(new Set(Array.from(product.variants, (variant) => variant.id)), new Set(["long", "short"]));
    const navyColors = product.variants.flatMap((variant) => variant.colors).filter((color) => color.id === "navy");
    assert.ok(navyColors.length >= 1);
    assert.ok(navyColors.every((color) => color.comingSoon === true));
  }

  const edge = products.find((product) => product.id === "edge");
  assert.ok(edge.variants.flatMap((variant) => variant.colors).every((color) => color.images.every((image) => !image.includes("daily-"))));

  const daily = products.find((product) => product.id === "daily");
  const dailyShortWhite = daily.variants.find((variant) => variant.id === "short").colors.find((color) => color.id === "white");
  assert.match(dailyShortWhite.images[0], /daily-short-white-5\.jpg$/);
});
