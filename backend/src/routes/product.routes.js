import express from 'express';
import {
    createProduct,
    updateProduct,
    deleteProduct
} from '../controllers/product.controller.js';

const router = express.Router();

// Create a new product
router.post('/', createProduct);

// Update an existing product by ID
router.put('/:id', updateProduct);

// Delete a product by ID
router.delete('/:id', deleteProduct);

export default router;

// import express from 'express';
// import {
//     createProduct,
//     updateProduct,
//     deleteProduct
// } from '../controllers/product.controller.js';

// const router = express.Router();

// console.log('🔍 DEBUG: Starting product routes setup...');

// try {
//     console.log('🔍 DEBUG: Adding POST /...');
//     router.post('/', createProduct);
//     console.log('✅ SUCCESS: POST / added');
// } catch (error) {
//     console.error('❌ ERROR: Failed to add POST /:', error.message);
//     throw error;
// }

// try {
//     console.log('🔍 DEBUG: Adding PUT /:id...');
//     router.put('/:id', updateProduct);
//     console.log('✅ SUCCESS: PUT /:id added');
// } catch (error) {
//     console.error('❌ ERROR: Failed to add PUT /:id:', error.message);
//     throw error;
// }

// try {
//     console.log('🔍 DEBUG: Adding DELETE /:id...');
//     router.delete('/:id', deleteProduct);
//     console.log('✅ SUCCESS: DELETE /:id added');
// } catch (error) {
//     console.error('❌ ERROR: Failed to add DELETE /:id:', error.message);
//     throw error;
// }

// console.log('🔍 DEBUG: Product routes setup complete');

// export default router;
