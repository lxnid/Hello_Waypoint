import { pathToFileURL } from 'node:url';
import { sql as query } from 'drizzle-orm';
import { createDatabase, type Database } from './client.js';
import { loadConfig } from '../config/env.js';
import { productInventory, products } from './schema.js';

// Demo catalogue only: this script never creates orders, plans, or delivery records.
const catalogue = [
  [
    'Fresh',
    'FRS-PINEAPPLE',
    'Pineapple',
    'case',
    'ambient',
    '8',
    '0.035',
    '2400',
    34,
    'Whole ripe pineapples, packed in protective cases.',
    'pineapple',
  ],
  [
    'Fresh',
    'FRS-BANANA',
    'Bananas',
    'case',
    'ambient',
    '10',
    '0.04',
    '1800',
    40,
    'Cavendish bananas for daily produce replenishment.',
    'banana',
  ],
  [
    'Fresh',
    'FRS-TOMATO',
    'Tomatoes',
    'crate',
    'ambient',
    '5',
    '0.025',
    '1500',
    30,
    'Firm ripe tomatoes in ventilated crates.',
    'tomato',
  ],
  [
    'Fresh',
    'FRS-CARROT',
    'Carrots',
    'crate',
    'ambient',
    '5',
    '0.025',
    '1200',
    30,
    'Washed carrots, graded and packed for display.',
    'carrot',
  ],
  [
    'Fresh',
    'FRS-POTATO',
    'Potatoes',
    'bag',
    'ambient',
    '10',
    '0.02',
    '2200',
    50,
    'Fresh potatoes in ten-kilogram sacks.',
    'potato',
  ],
  [
    'Fresh',
    'FRS-APPLE',
    'Apples',
    'case',
    'ambient',
    '6',
    '0.03',
    '3600',
    25,
    'Crisp apples protected in six-kilogram cases.',
    'apple',
  ],
  [
    'Fresh',
    'FRS-ORANGE',
    'Oranges',
    'case',
    'ambient',
    '8',
    '0.035',
    '2800',
    25,
    'Sweet oranges sorted for retail produce displays.',
    'orange',
  ],
  [
    'Fresh',
    'FRS-RICE',
    'White rice',
    'bag',
    'ambient',
    '10',
    '0.015',
    '2600',
    60,
    'Sealed ten-kilogram bags of white rice.',
    'rice',
  ],
  [
    'Fresh',
    'FRS-BROCCOLI',
    'Broccoli',
    'crate',
    'chilled',
    '4',
    '0.03',
    '2800',
    24,
    'Fresh broccoli. Keep refrigerated throughout delivery.',
    'broccoli',
  ],
  [
    'Fresh',
    'FRS-MILK',
    'Fresh milk',
    'case',
    'chilled',
    '12',
    '0.025',
    '5400',
    40,
    'Twelve one-litre cartons. Refrigerated transport required.',
    'milk',
  ],
  [
    'Fresh',
    'FRS-YOGURT',
    'Plain yogurt',
    'case',
    'chilled',
    '3',
    '0.012',
    '2400',
    30,
    'Plain yogurt cups in a refrigerated display case.',
    'yogurt',
  ],
  [
    'Fresh',
    'FRS-CHICKEN',
    'Chicken portions',
    'case',
    'chilled',
    '5',
    '0.02',
    '6500',
    20,
    'Sealed chilled chicken portions. Maintain the cold chain.',
    'chicken',
  ],
  [
    'Fresh',
    'FRS-CHEESE',
    'Cheddar cheese',
    'case',
    'chilled',
    '4',
    '0.018',
    '7200',
    20,
    'Individually sealed cheese packs for chilled displays.',
    'cheese',
  ],
  [
    'Style',
    'STY-TSHIRT',
    'Cotton T-shirts',
    'carton',
    'ambient',
    '4',
    '0.12',
    '12000',
    25,
    'Assorted cotton T-shirts, twenty retail units per carton.',
    'shirt',
  ],
  [
    'Style',
    'STY-JEANS',
    'Denim jeans',
    'carton',
    'ambient',
    '8',
    '0.15',
    '24000',
    20,
    'Folded denim jeans packed in protective cartons.',
    'jeans',
  ],
  [
    'Tech',
    'TEC-KETTLE',
    'Electric kettles',
    'carton',
    'ambient',
    '6',
    '0.1',
    '18000',
    15,
    'Boxed electric kettles. Handle cartons with care.',
    'kettle',
  ],
  [
    'Tech',
    'TEC-MONITOR',
    'Computer monitors',
    'item',
    'ambient',
    '5',
    '0.08',
    '48000',
    12,
    'Individually boxed monitors with protective inserts.',
    'monitor',
  ],
] as const;
export async function seedCatalogue(db: Database) {
  await db.transaction(async (tx) => {
    for (const [
      brandId,
      sku,
      name,
      orderingUnit,
      temperatureRequirement,
      unitWeightKg,
      unitVolumeM3,
      estimatedUnitValueLkr,
      maxOrderQuantity,
      description,
      image,
    ] of catalogue) {
      const values = {
        brandId,
        sku,
        name,
        orderingUnit,
        temperatureRequirement,
        unitWeightKg,
        unitVolumeM3,
        estimatedUnitValueLkr,
        maxOrderQuantity,
        description,
        imageUrl: `/catalog/${image}.svg`,
        isActive: true,
      };
      await tx
        .insert(products)
        .values(values)
        .onConflictDoUpdate({ target: products.sku, set: values });
      const [product] = await tx
        .select({ id: products.id })
        .from(products)
        .where(query`sku = ${sku}`);
      for (const depotId of ['Peliyagoda', 'Kandy'] as const) {
        await tx
          .insert(productInventory)
          .values({
            productId: product!.id,
            depotId,
            availableQuantity: sku === 'FRS-PINEAPPLE' ? 34 : maxOrderQuantity * 5,
          })
          .onConflictDoNothing();
      }
    }
    // Hide legacy synthetic catalogue placeholders while preserving historical foreign keys.
    await tx.execute(
      query`UPDATE products SET is_active=false WHERE sku IN ('DEMO-FRESH-DRY','DEMO-FRESH-CHILL','DEMO-STYLE','DEMO-TECH')`,
    );
  });
  return catalogue.length;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const connection = createDatabase(loadConfig().databaseUrl);
  try {
    console.info(
      `Seeded ${await seedCatalogue(connection.db)} catalogue products; no orders created`,
    );
  } finally {
    await connection.sql.end();
  }
}
