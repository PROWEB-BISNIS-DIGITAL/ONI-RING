const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const { isCustomer } = require('../middleware/authMiddleware');

// Middleware untuk semua route customer
router.use((req, res, next) => {
    console.log('Customer route accessed:', req.path);
    console.log('Session user:', req.session.user);
    next();
});

// Apply middleware untuk semua route customer
router.use(isCustomer);

// Dashboard Customer
router.get('/dashboard', customerController.getDashboard);

// Orders
router.get('/order', customerController.getPageOrders);
router.get('/order/:orderId', customerController.getOrderDetail);
router.post('/order/:orderId/cancel', customerController.cancelOrder);

// Modal Detail Order (AJAX)
router.get('/order/:orderId/detail', customerController.getOrderDetailModal);

// Invoice (new window)
router.get('/order/:orderId/invoice', customerController.getInvoice);

// Cancel Order (AJAX - untuk modal)
router.post('/order/:orderId/cancel-ajax', customerController.cancelOrderAjax);

// Account Management
router.get('/akun', customerController.getPageAkun);
router.post('/akun/update-profile', customerController.updateProfile);
router.post('/akun/update-password', customerController.updatePassword);

// Backward compatibility untuk route lama
router.post('/akun/password', customerController.updatePassword);

module.exports = router;