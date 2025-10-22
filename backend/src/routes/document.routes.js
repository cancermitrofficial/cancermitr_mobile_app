import express from 'express';
import {
    createDocument,
    updateDocument,
    deleteDocument,
} from '../controllers/document.controller.js';

const router = express.Router();

router.post('/', createDocument);         // POST /documents
router.put('/:id', updateDocument);       // PUT /documents/:id
router.delete('/:id', deleteDocument);    // DELETE /documents/:id

export default router;

