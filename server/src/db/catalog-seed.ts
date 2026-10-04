import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'csv-parse/sync';
import { eq, sql as query } from 'drizzle-orm';
import { createDatabase, type Database } from './client.js';
import { loadConfig } from '../config/env.js';
import { productInventory, products } from './schema.js';

type ProductCsv = {
  brand_id: string;
  sku: string;
  name: string;
  ordering_unit: string;
  temperature_requirement: 'ambient' | 'chilled';
  unit_weight_kg: string;
  unit_volume_m3: string;
  estimated_unit_value_lkr: string;
  max_order_quantity: string;
  description: string;
  image_url: string;
};

async function loadProducts(): Promise<ProductCsv[]> {
  const path = fileURLToPath(new URL('../../../data/reference/products.csv', import.meta.url));
  return parse(await readFile(path, 'utf8'), { columns: true, skip_empty_lines: true }) as ProductCsv[];
}

export async function seedCatalogue(db: Database) {
  const items = await loadProducts();
  await db.transaction(async (tx) => {
    // Clean up any legacy synthetic placeholder products
    await tx.execute(
      query`DELETE FROM products WHERE sku IN ('DEMO-FRESH-DRY','DEMO-FRESH-CHILL','DEMO-STYLE','DEMO-TECH')`,
    );

    for (const item of items) {
      const values = {
        brandId: item.brand_id,
        sku: item.sku,
        name: item.name,
        orderingUnit: item.ordering_unit,
        temperatureRequirement: item.temperature_requirement,
        unitWeightKg: item.unit_weight_kg,
        unitVolumeM3: item.unit_volume_m3,
        estimatedUnitValueLkr: item.estimated_unit_value_lkr,
        maxOrderQuantity: Number(item.max_order_quantity),
        description: item.description,
        imageUrl: item.image_url,
        isActive: true,
      };
      await tx
        .insert(products)
        .values(values)
        .onConflictDoUpdate({ target: products.sku, set: values });

      const [product] = await tx
        .select({ id: products.id })
        .from(products)
        .where(query`sku = ${item.sku}`);

      for (const depotId of ['Peliyagoda', 'Kandy'] as const) {
        const availableQuantity =
          item.sku === 'FRS-PINEAPPLE' ? 34 : (Number(item.max_order_quantity) || 20) * 5;
        await tx
          .insert(productInventory)
          .values({
            productId: product!.id,
            depotId,
            availableQuantity,
          })
          .onConflictDoUpdate({
            target: [productInventory.productId, productInventory.depotId],
            set: { availableQuantity },
          });
      }
    }
  });
  return items.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const connection = createDatabase(loadConfig().databaseUrl);
  try {
    console.info(
      `Seeded ${await seedCatalogue(connection.db)} catalogue products from products.csv; no orders created`,
    );
  } finally {
    await connection.sql.end();
  }
}
