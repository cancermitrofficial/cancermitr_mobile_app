import { prisma } from '../services/db.service.js';
import {
    syncProductToQdrant,
    removeProductFromQdrant
} from './sync.product.controller.js';

export async function createProduct(req, res) {
    const {
        name,
        description,
        symptoms,
        cancerTypes,
        category,
        stage,
        price,
        available
    } = req.body;

    try {
        const created = await prisma.product.create({
            data: {
                name,
                description,
                symptoms,
                cancerTypes,
                category,
                stage,
                price,
                available
            }
        });

        await syncProductToQdrant(created.id);

        res.status(201).json({
            message: '✅ Product created and synced to Qdrant',
            product: created
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to create product' });
    }
}

export async function updateProduct(req, res) {
    const { id } = req.params;
    const {
        name,
        description,
        symptoms,
        cancerTypes,
        category,
        stage,
        price,
        available
    } = req.body;

    try {
        const updated = await prisma.product.update({
            where: { id: Number(id) },
            data: {
                name,
                description,
                symptoms,
                cancerTypes,
                category,
                stage,
                price,
                available
            }
        });

        await syncProductToQdrant(updated.id);

        res.json({
            message: '✅ Product updated and Qdrant re-synced',
            product: updated
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update product' });
    }
}

export async function deleteProduct(req, res) {
    const { id } = req.params;
    try {
        await prisma.product.delete({
            where: { id: Number(id) }
        });

        await removeProductFromQdrant(Number(id));

        res.json({
            message: '🗑️ Product deleted from MySQL and Qdrant'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to delete product' });
    }
}
