const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');

// ==================== PUBLIC ROUTES ====================
// Route ini harus bisa diakses PUBLIC (tanpa auth)

// 1. Webhook untuk Midtrans notification (HARUS PUBLIC)
router.post('/midtrans-notification', orderController.midtransNotification);

// 2. Test endpoint untuk cek webhook
router.get('/midtrans-notification', (req, res) => {
  res.json({ 
    message: 'Midtrans webhook endpoint is ready',
    timestamp: new Date().toISOString(),
    url: req.originalUrl
  });
});

// 3. Create order (public - guest boleh order)
router.post('/', orderController.createOrder);

// 4. Check payment status (public)
router.get('/check-payment/:orderId', orderController.checkPaymentStatus);

// 5. Success page
router.get('/order-success', (req, res) => {
  const orderId = req.query.order_id || req.query.orderId || 'Unknown';
  res.render('customer/payment-success', { 
    title: 'Payment Success',
    orderId: orderId,
    user: req.session.user || null
  });
});

// ==================== PROTECTED ROUTES ====================
const { isAdmin, isAuthenticated } = require('../middleware/authMiddleware');

// 6. Get all orders (admin only)
router.get('/', isAdmin, orderController.getAllOrders);

// 7. Get order details (user bisa lihat order sendiri)
router.get('/:id', isAuthenticated, orderController.getOrderDetails);

// 8. Update order status (admin only)
router.put('/:id/status', isAdmin, orderController.updateOrderStatus);

module.exports = router;