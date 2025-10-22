import { prisma } from "../services/db.service.js";
import { getEmbedding } from "../services/embedding.service.js";
import {
  insertToQdrant,
  deleteFromQdrant,
  ensureCollection,
} from "../services/qdrant.service.js";

// Ensure product collection exists
await ensureCollection("product");

/**
 * Sync a single product to Qdrant (Insert or Update)
 */
export async function syncProductToQdrant(id) {
  const product = await prisma.product.findUnique({ where: { id } });

  if (!product) {
    throw new Error(`❌ Product with ID ${id} not found in MySQL`);
  }

  const text = `
Product Name: ${product.name}
Description: ${product.description || ""}
Used For Symptoms: ${product.symptoms?.join(", ")}
Useful In Cancer Types: ${product.cancerTypes?.join(", ")}
Category: ${product.category || "General"}
Stage: ${product.stage || "Any"}
`;

  const vector = await getEmbedding(text);

  await insertToQdrant("products", product.id, vector, {
    name: product.name,
    description: product.description,
    symptoms: product.symptoms,
    cancerTypes: product.cancerTypes,
    category: product.category,
    stage: product.stage,
    price: product.price,
    available: product.available,
  });

  console.log(
    `✅ Synced product to Qdrant: ID ${product.id} - ${product.name}`
  );
}

/**
 * Remove a product from Qdrant if deleted in MySQL
 */
export async function removeProductFromQdrant(id) {
  await deleteFromQdrant("products", id);
  console.log(`🗑️  Deleted product from Qdrant: ID ${id}`);
}

/**
 * Full reindex of all products in MySQL to Qdrant
 */
export async function resyncAllProducts() {
  const products = await prisma.product.findMany();

  console.log(`🔁 Reindexing ${products.length} products...`);

  for (const product of products) {
    const text = `
Product Name: ${product.name}
Description: ${product.description || ""}
Used For Symptoms: ${product.symptoms?.join(", ")}
Useful In Cancer Types: ${product.cancerTypes?.join(", ")}
Category: ${product.category || "General"}
Stage: ${product.stage || "Any"}
`;

    const vector = await getEmbedding(text);

    await insertToQdrant("products", product.id, vector, {
      name: product.name,
      description: product.description,
      symptoms: product.symptoms,
      cancerTypes: product.cancerTypes,
      category: product.category,
      stage: product.stage,
      price: product.price,
      available: product.available,
    });

    console.log(`📌 Reindexed product: ID ${product.id}`);
  }

  console.log(`✅ Done: All products re-synced to Qdrant.`);
}
