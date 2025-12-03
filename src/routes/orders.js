const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');

// Public routes (no authentication required)
router.post('/', orderController.createOrder); // Create new order

// Protected routes (require authentication)
router.get('/', orderController.getAllOrders); // Get all orders (admin)
router.get('/:id', orderController.getOrderDetails); // Get order details
router.put('/:id/status', orderController.updateOrderStatus); // Update order status

module.exports = router;