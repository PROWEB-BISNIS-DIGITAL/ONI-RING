// src/controllers/orderController.js
const pool = require('../config/database');
const { snap, coreApi } = require('../config/midtrans');

// ===============================
// 1. CREATE ORDER - DENGAN 2 OPSI PEMBAYARAN
// ===============================
exports.createOrder = async (req, res) => {
    console.log('=== CREATE ORDER REQUEST ===');
    console.log('Body:', JSON.stringify(req.body, null, 2));
    
    try {
        const { name, phone, address, payment, items, total } = req.body;

        // Validasi
        if (!name || !phone || !address || !items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Data pesanan tidak lengkap' 
            });
        }

        // Validasi nomor telepon
        const phoneRegex = /^08[0-9]{8,13}$/;
        if (!phoneRegex.test(phone)) {
            return res.status(400).json({
                success: false,
                message: 'Format nomor telepon tidak valid. Gunakan 08xxxxxxxxxx'
            });
        }

        const totalAmount = parseInt(total);
        if (isNaN(totalAmount) || totalAmount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Total amount tidak valid'
            });
        }

        const connection = await pool.getConnection();
        
        try {
            await connection.beginTransaction();

            // Generate order number
            const timestamp = Date.now();
            const random = Math.random().toString(36).substr(2, 6).toUpperCase();
            const orderNumber = `ORD${timestamp}${random}`;
            
            const userId = req.session?.user?.id || null;

            console.log('🔵 Creating order:', { 
                orderNumber, 
                name, 
                payment, 
                total: totalAmount,
                itemCount: items.length 
            });

            // 1. Insert order
            const [orderResult] = await connection.query(
                `INSERT INTO orders (
                    user_id, 
                    order_number,
                    customer_name, 
                    customer_phone, 
                    customer_address, 
                    payment_method, 
                    total, 
                    status, 
                    payment_status,
                    created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 'pending', NOW())`,
                [
                    userId, 
                    orderNumber, 
                    name.trim(), 
                    phone.trim(), 
                    address.trim(), 
                    payment, 
                    totalAmount
                ]
            );

            const orderId = orderResult.insertId;
            console.log('✅ Order saved to DB. ID:', orderId);

            // 2. Insert order items
            for (const item of items) {
                const itemPrice = parseInt(item.price);
                const itemQuantity = parseInt(item.quantity);
                
                if (isNaN(itemPrice) || itemPrice <= 0) {
                    throw new Error(`Invalid price for item: ${item.name}`);
                }
                
                if (isNaN(itemQuantity) || itemQuantity <= 0) {
                    throw new Error(`Invalid quantity for item: ${item.name}`);
                }

                await connection.query(
                    `INSERT INTO order_items (
                        order_id, 
                        product_id,
                        name,
                        quantity, 
                        price
                    ) VALUES (?, ?, ?, ?, ?)`,
                    [orderId, item.product_id, item.name.trim(), itemQuantity, itemPrice]
                );

                // Update stock
                try {
                    await connection.query(
                        `UPDATE products 
                         SET stock = stock - ? 
                         WHERE id = ? AND stock >= ?`,
                        [itemQuantity, item.product_id, itemQuantity]
                    );
                } catch (stockError) {
                    console.warn('⚠️ Stock update failed:', stockError.message);
                }
            }

            // 3. PROSES PEMBAYARAN
            let snapToken = null;
            let redirectUrl = null;
            
            if (payment === 'midtrans') {
                try {
                    console.log('🔵 Processing Midtrans for order:', orderNumber);
                    
                    const parameter = {
                        transaction_details: {
                            order_id: orderNumber,
                            gross_amount: totalAmount
                        },
                        credit_card: {
                            secure: true
                        },
                        customer_details: {
                            first_name: name.split(' ')[0] || name,
                            last_name: name.split(' ').slice(1).join(' ') || '',
                            email: `${phone}@customer.com`,
                            phone: phone,
                            billing_address: {
                                address: address,
                                city: 'Karawang',
                                postal_code: '41361',
                                country_code: 'IDN'
                            }
                        },
                        item_details: items.map(item => ({
                            id: item.product_id.toString(),
                            price: parseInt(item.price),
                            quantity: parseInt(item.quantity),
                            name: item.name.substring(0, 50)
                        })),
                        enabled_payments: [
                            'credit_card', 
                            'gopay', 
                            'shopeepay', 
                            'qris', 
                            'bank_transfer',
                            'cstore'
                        ],
                        callbacks: {
                            finish: `${process.env.BASE_URL || 'http://localhost:3000'}/order-success?order_id=${orderNumber}`,
                            error: `${process.env.BASE_URL || 'http://localhost:3000'}/order-error?order_id=${orderNumber}`,
                            pending: `${process.env.BASE_URL || 'http://localhost:3000'}/order-pending?order_id=${orderNumber}`
                        }
                    };

                    console.log('📋 Midtrans Parameter:', JSON.stringify(parameter, null, 2));

                    // Buat Snap transaction
                    const transaction = await snap.createTransaction(parameter);
                    
                    console.log('✅ Midtrans Response:', {
                        token: transaction.token?.substring(0, 20) + '...',
                        redirect_url: transaction.redirect_url
                    });

                    snapToken = transaction.token;
                    redirectUrl = transaction.redirect_url;

                    // Update order dengan token
                    await connection.query(
                        `UPDATE orders SET 
                            payment_token = ?,
                            midtrans_order_id = ?,
                            updated_at = NOW()
                         WHERE id = ?`,
                        [snapToken, orderNumber, orderId]
                    );

                } catch (midtransError) {
                    console.error('❌ Midtrans Error:', midtransError.message);
                    
                    // Tetap simpan order, tapi set sebagai COD fallback
                    await connection.query(
                        `UPDATE orders SET 
                            payment_method = 'COD',
                            notes = CONCAT(IFNULL(notes, ''), ' | Midtrans error: ', ?),
                            updated_at = NOW()
                         WHERE id = ?`,
                        [midtransError.message.substring(0, 200), orderId]
                    );
                    
                    payment = 'COD';
                }
            }

            await connection.commit();

            console.log('🎉 Order created successfully:', { 
                orderNumber, 
                payment,
                hasToken: !!snapToken 
            });

            // Response
            const response = {
                success: true,
                message: payment === 'COD' 
                    ? 'Pesanan COD berhasil dibuat' 
                    : 'Transaksi berhasil dibuat, selesaikan pembayaran',
                order_id: orderNumber,
                order_db_id: orderId,
                customer_name: name,
                total_amount: totalAmount,
                payment_method: payment,
                status: 'pending',
                created_at: new Date().toISOString()
            };

            // Tambahkan token jika ada
            if (snapToken) {
                response.snap_token = snapToken;
                response.redirect_url = redirectUrl;
            }

            res.json(response);

        } catch (err) {
            await connection.rollback();
            console.error('❌ Transaction Error:', {
                message: err.message,
                stack: err.stack
            });
            
            res.status(500).json({ 
                success: false, 
                message: 'Gagal membuat pesanan. Silakan coba lagi.',
                error: process.env.NODE_ENV === 'development' ? err.message : undefined
            });
        } finally {
            connection.release();
        }

    } catch (err) {
        console.error('❌ Create Order Error:', {
            message: err.message,
            stack: err.stack
        });
        
        res.status(500).json({ 
            success: false, 
            message: 'Terjadi kesalahan. Coba lagi nanti.',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
};

// ===============================
// 2. MIDTRANS NOTIFICATION HANDLER
// ===============================
exports.midtransNotification = async (req, res) => {
    console.log('🔔 MIDTRANS NOTIFICATION RECEIVED');
    
    try {
        const notification = req.body;
        console.log('Notification:', JSON.stringify(notification, null, 2));
        
        if (!notification || !notification.order_id) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid notification' 
            });
        }
        
        const orderId = notification.order_id;
        const transactionStatus = notification.transaction_status;
        const fraudStatus = notification.fraud_status || 'accept';
        
        console.log('Processing:', { orderId, transactionStatus, fraudStatus });
        
        // Log notification
        try {
            await pool.query(
                `INSERT INTO payment_logs 
                 (order_number, payment_method, amount, status, transaction_id, response_data)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    orderId,
                    notification.payment_type || 'unknown',
                    notification.gross_amount || 0,
                    transactionStatus,
                    notification.transaction_id || 'unknown',
                    JSON.stringify(notification)
                ]
            );
        } catch (logError) {
            console.error('Log error:', logError.message);
        }
        
        // Update order status
        let orderStatus = 'pending';
        let paymentStatus = 'pending';
        
        switch (transactionStatus) {
            case 'capture':
                if (fraudStatus === 'accept') {
                    orderStatus = 'completed';
                    paymentStatus = 'paid';
                } else {
                    orderStatus = 'challenge';
                }
                break;
                
            case 'settlement':
                orderStatus = 'completed';
                paymentStatus = 'paid';
                break;
                
            case 'pending':
                orderStatus = 'pending';
                paymentStatus = 'pending';
                break;
                
            case 'deny':
            case 'expire':
            case 'cancel':
                orderStatus = 'cancelled';
                paymentStatus = transactionStatus;
                break;
        }
        
        try {
            await pool.query(
                `UPDATE orders SET 
                    status = ?,
                    payment_status = ?,
                    midtrans_transaction_id = ?,
                    updated_at = NOW()
                 WHERE order_number = ?`,
                [
                    orderStatus,
                    paymentStatus,
                    notification.transaction_id || null,
                    orderId
                ]
            );
            
            console.log(`✅ Order ${orderId} updated to ${orderStatus}`);
            
        } catch (updateError) {
            console.error('Update error:', updateError.message);
        }
        
        res.status(200).json({ 
            success: true, 
            message: 'Notification processed' 
        });
        
    } catch (error) {
        console.error('❌ Notification Error:', error.message);
        res.status(500).json({ 
            success: false, 
            message: 'Error processing notification' 
        });
    }
};

// ===============================
// 3. CHECK PAYMENT STATUS
// ===============================
exports.checkPaymentStatus = async (req, res) => {
    try {
        const { orderId } = req.params;
        
        console.log('🔍 Checking status for:', orderId);
        
        const [order] = await pool.query(
            `SELECT * FROM orders WHERE order_number = ?`,
            [orderId]
        );
        
        if (order.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Order tidak ditemukan'
            });
        }
        
        const orderData = order[0];
        
        res.json({
            success: true,
            order_id: orderData.order_number,
            customer_name: orderData.customer_name,
            total_amount: orderData.total,
            payment_method: orderData.payment_method,
            status: orderData.status,
            payment_status: orderData.payment_status,
            created_at: orderData.created_at
        });
        
    } catch (error) {
        console.error('❌ Check Status Error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Gagal mengecek status'
        });
    }
};

// ===============================
// 4. GET ORDER DETAILS
// ===============================
exports.getOrderDetails = async (req, res) => {
    try {
        const { id } = req.params;
        
        console.log('📋 Getting details for:', id);
        
        // Cari berdasarkan ID atau order_number
        const isNumeric = !isNaN(id);
        const queryField = isNumeric ? 'o.id' : 'o.order_number';
        
        const [order] = await pool.query(
            `SELECT o.* FROM orders o WHERE ${queryField} = ?`,
            [id]
        );
        
        if (order.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Order tidak ditemukan' 
            });
        }
        
        const [items] = await pool.query(
            `SELECT oi.*, p.name as product_name, p.image 
             FROM order_items oi
             LEFT JOIN products p ON oi.product_id = p.id
             WHERE oi.order_id = ?
             ORDER BY oi.created_at`,
            [order[0].id]
        );
        
        res.json({ 
            success: true, 
            order: order[0],
            items: items
        });
        
    } catch (error) {
        console.error('❌ Get Details Error:', error.message);
        res.status(500).json({ 
            success: false, 
            message: 'Gagal mengambil detail order'
        });
    }
};

// ===============================
// 5. GET PAYMENT PAGE
// ===============================
exports.getPaymentPage = async (req, res) => {
    try {
        const { orderId } = req.params;
        
        console.log('💰 Getting payment page for:', orderId);
        
        const [order] = await pool.query(
            `SELECT * FROM orders WHERE order_number = ?`,
            [orderId]
        );
        
        if (order.length === 0) {
            return res.status(404).send('Order tidak ditemukan');
        }
        
        const orderData = order[0];
        
        if (orderData.payment_method === 'COD') {
            return res.redirect(`/order-success?order_id=${orderId}`);
        }
        
        if (!orderData.payment_token) {
            return res.status(400).send('Token pembayaran tidak ditemukan');
        }
        
        // Render simple payment page
        const html = `
            <!DOCTYPE html>
            <html lang="id">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Pembayaran - ${orderData.order_number}</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        max-width: 600px;
                        margin: 0 auto;
                        padding: 20px;
                        text-align: center;
                    }
                    .container {
                        background: #f9f9f9;
                        border-radius: 10px;
                        padding: 30px;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    }
                    .loading {
                        margin: 20px 0;
                        color: #666;
                    }
                    .spinner {
                        border: 4px solid #f3f3f3;
                        border-top: 4px solid #3498db;
                        border-radius: 50%;
                        width: 40px;
                        height: 40px;
                        animation: spin 1s linear infinite;
                        margin: 0 auto;
                    }
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                </style>
                <script type="text/javascript"
                    src="https://app.sandbox.midtrans.com/snap/snap.js"
                    data-client-key="${process.env.MIDTRANS_CLIENT_KEY || 'Mid-client-wu4jZk-6I4uaNjsF'}">
                </script>
            </head>
            <body>
                <div class="container">
                    <h1>Pembayaran Order</h1>
                    <p><strong>Kode Order:</strong> ${orderData.order_number}</p>
                    <p><strong>Total:</strong> Rp ${orderData.total.toLocaleString('id-ID')}</p>
                    
                    <div class="loading">
                        <div class="spinner"></div>
                        <p>Mempersiapkan halaman pembayaran...</p>
                    </div>
                    
                    <div id="snap-container" style="display: none;"></div>
                </div>
                
                <script>
                    // Auto trigger Snap payment
                    setTimeout(() => {
                        window.snap.pay('${orderData.payment_token}', {
                            onSuccess: function(result) {
                                window.location.href = '/order-success?order_id=${orderData.order_number}';
                            },
                            onPending: function(result) {
                                window.location.href = '/order-pending?order_id=${orderData.order_number}';
                            },
                            onError: function(result) {
                                window.location.href = '/order-error?order_id=${orderData.order_number}';
                            },
                            onClose: function() {
                                window.location.href = '/order-pending?order_id=${orderData.order_number}';
                            }
                        });
                    }, 1000);
                </script>
            </body>
            </html>
        `;
        
        res.send(html);
        
    } catch (error) {
        console.error('❌ Get Payment Page Error:', error.message);
        res.status(500).send('Terjadi kesalahan saat memuat halaman pembayaran');
    }
};

// ===============================
// 6. ALTERNATIVE NOTIFICATION HANDLER
// ===============================
exports.midtransNotificationManual = async (req, res) => {
    console.log('📨 Manual Notification Received');
    console.log('Body:', req.body);
    console.log('Query:', req.query);
    
    try {
        // Combine body and query params
        const data = { ...req.body, ...req.query };
        
        await pool.query(
            `INSERT INTO payment_logs 
             (order_number, status, response_data)
             VALUES (?, ?, ?)`,
            [
                data.order_id || 'unknown',
                data.transaction_status || 'unknown',
                JSON.stringify(data)
            ]
        );
        
        res.json({ 
            success: true, 
            message: 'Manual notification received' 
        });
        
    } catch (error) {
        console.error('Manual notification error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error processing manual notification' 
        });
    }
};

// ===============================
// 7. FOR ADMIN ROUTES
// ===============================
exports.getAllOrders = async (req, res) => {
    try {
        const { page = 1, limit = 20, status } = req.query;
        const offset = (page - 1) * limit;
        
        let query = `SELECT * FROM orders`;
        let params = [];
        
        if (status) {
            query += ` WHERE status = ?`;
            params.push(status);
        }
        
        query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
        params.push(parseInt(limit), offset);
        
        const [orders] = await pool.query(query, params);
        const [countResult] = await pool.query(`SELECT COUNT(*) as total FROM orders`);
        
        res.json({
            success: true,
            data: orders,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: countResult[0].total
            }
        });
        
    } catch (error) {
        console.error('Get all orders error:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil data order'
        });
    }
};

exports.updateOrderStatus = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { status } = req.body;
        
        const validStatuses = ['pending', 'confirmed', 'processing', 'completed', 'cancelled'];
        
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Status tidak valid'
            });
        }
        
        await pool.query(
            `UPDATE orders SET status = ?, updated_at = NOW() WHERE id = ?`,
            [status, orderId]
        );
        
        res.json({
            success: true,
            message: 'Status berhasil diupdate'
        });
        
    } catch (error) {
        console.error('Update status error:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal update status'
        });
    }
};

// Ekspor semua function
module.exports = {
    createOrder: exports.createOrder,
    midtransNotification: exports.midtransNotification,
    midtransNotificationManual: exports.midtransNotificationManual,
    checkPaymentStatus: exports.checkPaymentStatus,
    getOrderDetails: exports.getOrderDetails,
    getPaymentPage: exports.getPaymentPage,
    getAllOrders: exports.getAllOrders,
    updateOrderStatus: exports.updateOrderStatus
};