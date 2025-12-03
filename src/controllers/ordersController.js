const db = require('../config/database');

// Halaman Orders
exports.getOrders = async (req, res) => {
    try {
        const [orders] = await db.query(`
            SELECT 
                o.id,
                o.customer_name,
                o.customer_phone,
                o.customer_address,
                o.payment_method,
                o.total,
                o.status,
                o.created_at,
                o.updated_at
            FROM orders o
            ORDER BY o.created_at DESC
        `);

        for (let order of orders) {
            const [items] = await db.query(`
                SELECT 
                    oi.id,
                    oi.product_id,
                    oi.quantity,
                    oi.price,
                    p.name as product_name
                FROM order_items oi
                LEFT JOIN products p ON oi.product_id = p.id
                WHERE oi.order_id = ?
            `, [order.id]);
            
            order.items = items;
            order.orderNumber = `ORD-${order.id.toString().padStart(3, '0')}`;
        }

        const [stats] = await db.query(`
            SELECT 
                COUNT(*) as total_orders,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_orders,
                SUM(total) as total_revenue,
                AVG(total) as avg_order
            FROM orders
            WHERE MONTH(created_at) = MONTH(CURRENT_DATE())
            AND YEAR(created_at) = YEAR(CURRENT_DATE())
        `);

        res.render('admin/orders', {
            title: 'Data Pesanan',
            orders: orders,
            stats: stats[0]
        });
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).render('error', {
            message: 'Terjadi kesalahan saat memuat data pesanan',
            error: error
        });
    }
};

// Get Order Detail
exports.getOrderDetail = async (req, res) => {
    const { orderId } = req.params;
    
    try {
        const [orders] = await db.query(`
            SELECT o.*
            FROM orders o
            WHERE o.id = ?
        `, [orderId]);

        if (orders.length === 0) {
            return res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan' });
        }

        const order = orders[0];
        
        const [items] = await db.query(`
            SELECT 
                oi.*,
                p.name as product_name
            FROM order_items oi
            LEFT JOIN products p ON oi.product_id = p.id
            WHERE oi.order_id = ?
        `, [orderId]);

        order.items = items;
        order.orderNumber = `ORD-${order.id.toString().padStart(3, '0')}`;

        res.json({ success: true, order: order });
    } catch (error) {
        console.error('Error fetching order detail:', error);
        res.status(500).json({ success: false, message: 'Gagal memuat detail pesanan' });
    }
};

// Update Order Status - FUNGSI BARU INI YANG DIPANGGIL DROPDOWN
exports.updateOrderStatus = async (req, res) => {
    const { orderId } = req.params;
    const { status } = req.body;
    
    const validStatuses = ['pending', 'confirmed', 'processing', 'completed', 'cancelled'];
    
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ 
            success: false, 
            message: 'Status tidak valid' 
        });
    }
    
    try {
        await db.query(`
            UPDATE orders 
            SET status = ?, updated_at = NOW()
            WHERE id = ?
        `, [status, orderId]);

        res.json({ 
            success: true, 
            message: `Status pesanan berhasil diubah menjadi "${status}"` 
        });
    } catch (error) {
        console.error('Error updating order status:', error);
        res.status(500).json({ success: false, message: 'Gagal update status pesanan' });
    }
};

// Approve Order
exports.approveOrder = async (req, res) => {
    const { orderId } = req.params;
    try {
        await db.query(`
            UPDATE orders
            SET status = 'confirmed', updated_at = NOW()
            WHERE id = ?
        `, [orderId]);

        res.json({ success: true, message: 'Pesanan berhasil diapprove!' });
    } catch (error) {
        console.error('Error approving order:', error);
        res.status(500).json({ success: false, message: 'Gagal approve pesanan' });
    }
};

// Cancel Order
exports.cancelOrder = async (req, res) => {
    const { orderId } = req.params;
    const { reason, notes } = req.body || {};
    try {
        await db.query(`
            UPDATE orders
            SET status = 'cancelled', updated_at = NOW()
            WHERE id = ?
        `, [orderId]);

        res.json({ success: true, message: 'Pesanan berhasil dibatalkan!' });
    } catch (error) {
        console.error('Error cancelling order:', error);
        res.status(500).json({ success: false, message: 'Gagal cancel pesanan' });
    }
};

// Complete Order
exports.completeOrder = async (req, res) => {
    const { orderId } = req.params;
    
    try {
        await db.query(`
            UPDATE orders 
            SET status = 'completed', updated_at = NOW()
            WHERE id = ?
        `, [orderId]);

        res.json({ success: true, message: 'Pesanan berhasil diselesaikan!' });
    } catch (error) {
        console.error('Error completing order:', error);
        res.status(500).json({ success: false, message: 'Gagal menyelesaikan pesanan' });
    }
};