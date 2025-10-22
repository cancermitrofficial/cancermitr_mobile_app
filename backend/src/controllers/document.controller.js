import { prisma } from '../services/db.service.js';
import { syncDocumentToQdrant, removeDocumentFromQdrant } from './sync.document.controller.js';

export async function createDocument(req, res) {
    const { title, content } = req.body;

    try {
        const created = await prisma.document.create({
            data: { title, content },
        });

        await syncDocumentToQdrant(created.id);

        res.status(201).json({ message: '✅ Created and synced document', created });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to create document' });
    }
}

export async function updateDocument(req, res) {
    const { id } = req.params;
    const { title, content } = req.body;

    try {
        const updated = await prisma.document.update({
            where: { id: Number(id) },
            data: { title, content },
        });

        await syncDocumentToQdrant(updated.id);

        res.json({ message: '✅ Updated document & Qdrant vector', updated });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update document' });
    }
}

export async function deleteDocument(req, res) {
    const { id } = req.params;

    try {
        await prisma.document.delete({ where: { id: Number(id) } });
        await removeDocumentFromQdrant(Number(id));

        res.json({ message: '🗑️ Deleted from MySQL and Qdrant' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to delete document' });
    }
}
