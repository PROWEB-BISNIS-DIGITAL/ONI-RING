const pool = require('../config/database');

// Create new order (public - no login required)
exports.createOrder = async (req, res) => {
    const { name, phone, address, payment, items, total } = req.body;

    // Validation
    if (!name || !phone || !address || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ 
            success: false, 
            message: 'Data pesanan tidak lengkap' 
        });
    }

    // Validate phone format
    const phoneRegex = /^08[0-9]{8,13}$/;
    if (!phoneRegex.test(phone)) {
        return res.status(400).json({
            success: false,
            message: 'Format nomor telepon tidak valid. Gunakan format 08xxxxxxxxxx'
        });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // Insert order - set user_id to NULL for guest, or use logged in user if available
        const userId = req.session && req.session.userId ? req.session.userId : null;
        
        const [result] = await connection.query(
            `INSERT INTO orders (
                user_id, 
                customer_name, 
                customer_phone, 
                customer_address, 
                payment_method, 
                total, 
                status, 
                created_at, 
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'pending', NOW(), NOW())`,
            [userId, name, phone, address, payment, total]
        );

        const orderId = result.insertId;

        // Insert order items
        for (const item of items) {
            await connection.query(
                `INSERT INTO order_items (
                    order_id, 
                    product_id, 
                    quantity, 
                    price
                ) VALUES (?, ?, ?, ?)`,
                [orderId, item.product_id, item.quantity, item.price]
            );
        }

        await connection.commit();

        res.json({ 
            success: true, 
            message: 'Pesanan berhasil dibuat', 
            orderId,
            data: {
                orderId,
                customerName: name,
                total: total
            }
        });

    } catch (err) {
        await connection.rollback();
        console.error('Error creating order:', err);
        
        let errorMessage = 'Gagal membuat pesanan';
        if (err.code === 'ER_DUP_ENTRY') {
            errorMessage = 'Data duplikat terdeteksi';
        } else if (err.code === 'ER_NO_REFERENCED_ROW') {
            errorMessage = 'Produk tidak ditemukan';
        }
        
        res.status(500).json({ 
            success: false, 
            message: errorMessage,
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    } finally {
        connection.release();
    }
};

// Get all orders (for admin)
exports.getAllOrders = async (req, res) => {
    try {
        const [orders] = await pool.query(`
            SELECT o.*, 
                   COUNT(oi.id) as item_count,
                   GROUP_CONCAT(p.name SEPARATOR ', ') as items
            FROM orders o
            LEFT JOIN order_items oi ON o.id = oi.order_id
            LEFT JOIN products p ON oi.product_id = p.id
            GROUP BY o.id
            ORDER BY o.created_at DESC
        `);
        
        res.json({ success: true, orders });
    } catch (err) {
        console.error('Error fetching orders:', err);
        res.status(500).json({ success: false, message: 'Gagal mengambil data order' });
    }
};

// Get order details
exports.getOrderDetails = async (req, res) => {
    const { id } = req.params;
    
    try {
        const [order] = await pool.query(
            'SELECT * FROM orders WHERE id = ?',
            [id]
        );
        
        if (order.length === 0) {
            return res.status(404).json({ success: false, message: 'Order tidak ditemukan' });
        }
        
        const [items] = await pool.query(
            `SELECT oi.*, p.name as product_name 
             FROM order_items oi
             LEFT JOIN products p ON oi.product_id = p.id
             WHERE oi.order_id = ?`,
            [id]
        );
        
        res.json({ 
            success: true, 
            order: order[0],
            items 
        });
    } catch (err) {
        console.error('Error fetching order details:', err);
        res.status(500).json({ success: false, message: 'Gagal mengambil detail order' });
    }
};

// Update order status (admin)
exports.updateOrderStatus = async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    
    const validStatuses = ['pending', 'confirmed', 'processing', 'completed', 'cancelled'];
    
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ 
            success: false, 
            message: 'Status tidak valid' 
        });
    }
    
    try {
        await pool.query(
            `UPDATE orders 
             SET status = ?, updated_at = NOW() 
             WHERE id = ?`,
            [status, id]
        );
        
        res.json({ 
            success: true, 
            message: `Status order berhasil diupdate ke ${status}` 
        });
    } catch (err) {
        console.error('Error updating order status:', err);
        res.status(500).json({ 
            success: false, 
            message: 'Gagal update status order' 
        });
    }
};  