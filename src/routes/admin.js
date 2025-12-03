const express = require('express');
const router = express.Router();

// Import controllers
const dashboardController = require('../controllers/dashboardController');
const ordersController = require('../controllers/ordersController');
const productsController = require('../controllers/productsController');
const usersController = require('../controllers/usersController');

// Middleware untuk check admin (pastikan Anda sudah punya middleware ini)
const { isAdmin } = require('../middleware/authMiddleware');

// Apply middleware ke semua route admin
router.use(isAdmin);

// ============ DASHBOARD ROUTES ============
router.get('/dashboard', dashboardController.getDashboard);

// ============ ORDERS ROUTES ============
router.get('/orders', ordersController.getOrders);
router.get('/orders/:orderId', ordersController.getOrderDetail);
router.post('/orders/:orderId/approve', ordersController.approveOrder);
router.post('/orders/:orderId/cancel', ordersController.cancelOrder);
router.post('/orders/:orderId/complete', ordersController.completeOrder);

// ============ PRODUCTS ROUTES ============
router.get('/products', productsController.getProducts);
router.post('/products', productsController.addProduct);
router.get('/products/:productId', productsController.getProductById);
router.put('/products/:productId', productsController.updateProduct);
router.delete('/products/:productId', productsController.deleteProduct);
router.post('/products/:productId/toggle-status', productsController.toggleProductStatus);

// ============ USERS ROUTES ============
router.get('/users', usersController.getUsers);
router.get('/users/:userId', usersController.getUserById);
router.post('/users', usersController.addUser);
router.put('/users/:userId', usersController.updateUser);
router.delete('/users/:userId', usersController.deleteUser);
router.post('/users/:userId/toggle-role', usersController.toggleUserRole);

module.exports = router;