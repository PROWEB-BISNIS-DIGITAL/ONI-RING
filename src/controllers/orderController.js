// src/controllers/orderController.js
const pool = require('../config/database');
const { snap, coreApi } = require('../config/midtrans');

// ===============================
// CREATE ORDER WITH MIDTRANS
// ===============================
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

    // Validasi total harus number
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

        // Generate unique order number - format: ORD-{timestamp}-{random}
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 9).toUpperCase();
        const orderNumber = `ORD-${timestamp}-${random}`;
        
        const userId = req.session?.user?.id || null;

        console.log('🔵 Creating order:', { orderNumber, name, total: totalAmount });

        // 1. Insert order ke database
        const [orderResult] = await connection.query(
            `INSERT INTO orders (
                user_id, 
                order_number,
                customer_name, 
                customer_phone, 
                customer_email,
                customer_address, 
                payment_method, 
                total, 
                status, 
                payment_status,
                created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending', NOW())`,
            [
                userId, 
                orderNumber, 
                name.trim(), 
                phone.trim(), 
                `${phone}@customer.com`, // Default email
                address.trim(), 
                payment, 
                totalAmount
            ]
        );

        const orderId = orderResult.insertId;
        console.log('✅ Order saved to DB. ID:', orderId);

        // 2. Insert order items dan update stock
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

            // Update stock produk (optional, jika ada stock management)
            try {
                await connection.query(
                    `UPDATE products 
                     SET stock = stock - ? 
                     WHERE id = ? AND stock >= ?`,
                    [itemQuantity, item.product_id, itemQuantity]
                );
            } catch (stockError) {
                console.warn('⚠️ Stock update failed:', stockError.message);
                // Continue without stock update
            }
        }

        // 3. PROSES MIDTRANS (jika bukan COD)
        let paymentData = null;
        
        if (payment !== 'COD') {
            try {
                console.log('🔵 Processing Midtrans for order:', orderNumber);
                
                // Prepare parameter sesuai dokumentasi Midtrans
                const parameter = {
                    transaction_details: {
                        order_id: orderNumber, // HARUS UNIQUE
                        gross_amount: totalAmount // Integer, tanpa desimal
                    },
                    credit_card: {
                        secure: true, // Enable 3D Secure
                        save_card: false // Optional: save card for future
                    },
                    customer_details: {
                        first_name: name.split(' ')[0] || name,
                        last_name: name.split(' ').slice(1).join(' ') || '',
                        email: `${phone}@customer.com`,
                        phone: phone,
                        billing_address: {
                            first_name: name.split(' ')[0] || name,
                            last_name: name.split(' ').slice(1).join(' ') || '',
                            phone: phone,
                            address: address,
                            city: 'Jakarta',
                            postal_code: '12345',
                            country_code: 'IDN'
                        },
                        shipping_address: {
                            first_name: name.split(' ')[0] || name,
                            last_name: name.split(' ').slice(1).join(' ') || '',
                            phone: phone,
                            address: address,
                            city: 'Jakarta',
                            postal_code: '12345',
                            country_code: 'IDN'
                        }
                    },
                    item_details: items.map((item, index) => ({
                        id: item.product_id.toString(),
                        price: parseInt(item.price),
                        quantity: parseInt(item.quantity),
                        name: item.name.substring(0, 50),
                        merchant_name: 'Cemal-Cemil'
                    })),
                    enabled_payments: getEnabledPayments(payment),
                    callbacks: {
                        finish: `${process.env.BASE_URL || 'http://localhost:3000'}/order-success?order_id=${orderNumber}`
                    },
                    expiry: {
                        unit: 'hour',
                        duration: 24
                    },
                    custom_field1: `Customer: ${name}`,
                    custom_field2: `Phone: ${phone}`,
                    custom_field3: `DB_ID: ${orderId}`
                };

                console.log('📋 Midtrans Parameter:', JSON.stringify(parameter, null, 2));

                // Buat Snap transaction
                const transaction = await snap.createTransaction(parameter);
                
                console.log('✅ Midtrans Response:', {
                    token: transaction.token?.substring(0, 20) + '...',
                    redirect_url: transaction.redirect_url
                });

                paymentData = {
                    token: transaction.token,
                    redirect_url: transaction.redirect_url
                };

                // Update order dengan token Midtrans
                await connection.query(
                    `UPDATE orders SET 
                        payment_token = ?,
                        midtrans_order_id = ?,
                        payment_status = 'pending',
                        updated_at = NOW()
                     WHERE id = ?`,
                    [transaction.token, orderNumber, orderId]
                );

                // Log payment
                await logPayment(
                    orderId, 
                    orderNumber, 
                    payment, 
                    totalAmount, 
                    'created', 
                    null, 
                    { 
                        token: transaction.token?.substring(0, 20) + '...',
                        redirect_url: transaction.redirect_url
                    }
                );

            } catch (midtransError) {
                console.error('❌ Midtrans Error:', {
                    message: midtransError.message,
                    code: midtransError.ApiResponse?.status_code,
                    response: midtransError.ApiResponse
                });
                
                // Tetap simpan order, tapi set sebagai COD fallback
                await connection.query(
                    `UPDATE orders SET 
                        payment_method = 'COD',
                        payment_status = 'failed',
                        notes = CONCAT(IFNULL(notes, ''), ' | Midtrans error: ', ?),
                        updated_at = NOW()
                     WHERE id = ?`,
                    [midtransError.message.substring(0, 200), orderId]
                );
                
                // Log error
                await logPayment(
                    orderId, 
                    orderNumber, 
                    payment, 
                    totalAmount, 
                    'midtrans_error', 
                    null, 
                    { 
                        error: midtransError.message,
                        api_response: midtransError.ApiResponse
                    }
                );
                
                // Kirim response dengan fallback ke COD
                payment = 'COD';
                paymentData = null;
            }
        } else {
            // Untuk COD, langsung log payment
            await logPayment(orderId, orderNumber, 'COD', totalAmount, 'pending', null, { method: 'COD' });
        }

        await connection.commit();

        console.log('🎉 Order created successfully:', { orderNumber, payment, hasPaymentData: !!paymentData });

        // Response berdasarkan payment method
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
            timestamp: new Date().toISOString()
        };

        // Tambahkan payment data jika ada
        if (paymentData) {
            response.snap_token = paymentData.token;
            response.snap_redirect_url = paymentData.redirect_url;
        }

        res.json(response);

    } catch (err) {
        await connection.rollback();
        console.error('❌ Error creating order:', {
            message: err.message,
            code: err.code,
            stack: err.stack
        });
        
        let errorMessage = 'Gagal membuat pesanan';
        let statusCode = 500;
        
        if (err.message.includes('Midtrans')) {
            errorMessage = 'Gagal memproses pembayaran. Silakan coba metode pembayaran lain.';
        } else if (err.code === 'ER_DUP_ENTRY') {
            errorMessage = 'Data duplikat terdeteksi. Silakan coba lagi.';
            statusCode = 409;
        } else if (err.message.includes('Invalid') || err.message.includes('valid')) {
            errorMessage = err.message;
            statusCode = 400;
        }
        
        res.status(statusCode).json({ 
            success: false, 
            message: errorMessage,
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    } finally {
        connection.release();
    }
};

// ===============================
// MIDTRANS NOTIFICATION HANDLER
// ===============================
exports.midtransNotification = async (req, res) => {
    console.log('🔔 MIDTRANS WEBHOOK RECEIVED');
    console.log('Time:', new Date().toISOString());
    console.log('Method:', req.method);
    console.log('URL:', req.originalUrl);
    console.log('Headers:', req.headers);
    
    try {
        const notification = req.body;
        
        if (!notification || Object.keys(notification).length === 0) {
            console.log('⚠️ Empty notification received');
            return res.status(400).json({ 
                success: false, 
                message: 'Empty notification body' 
            });
        }
        
        console.log('📦 Notification Body:', JSON.stringify(notification, null, 2));
        
        // 1. Log notification ke database
        const logConn = await pool.getConnection();
        try {
            await logConn.query(
                `INSERT INTO payment_logs 
                 (order_number, payment_method, amount, status, transaction_id, response_data)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    notification.order_id || 'unknown',
                    notification.payment_type || 'unknown',
                    notification.gross_amount || 0,
                    notification.transaction_status || 'unknown',
                    notification.transaction_id || 'unknown',
                    JSON.stringify(notification)
                ]
            );
            console.log('✅ Notification logged to database');
        } catch (dbError) {
            console.error('❌ Error logging notification:', dbError.message);
        } finally {
            logConn.release();
        }
        
        // 2. Verifikasi notification dengan Core API (REKOMENDASI MIDTRANS)
        let statusResponse;
        try {
            statusResponse = await coreApi.transaction.notification(notification);
            console.log('✅ Midtrans verification success:', {
                order_id: statusResponse.order_id,
                transaction_status: statusResponse.transaction_status,
                fraud_status: statusResponse.fraud_status
            });
        } catch (verifyError) {
            console.error('❌ Midtrans verification failed:', verifyError.message);
            // Gunakan data dari notification jika verifikasi gagal
            statusResponse = notification;
            console.log('⚠️ Using notification data as fallback');
        }
        
        const orderId = statusResponse.order_id;
        const transactionStatus = statusResponse.transaction_status;
        const fraudStatus = statusResponse.fraud_status || 'accept';
        const transactionId = statusResponse.transaction_id;
        const paymentType = statusResponse.payment_type;
        
        if (!orderId) {
            console.error('❌ No order_id in notification');
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid notification: missing order_id' 
            });
        }
        
        // 3. Mapping transaction status ke order status
        let orderStatus = 'pending';
        let paymentStatus = 'pending';
        
        switch (transactionStatus) {
            case 'capture':
                if (fraudStatus === 'challenge') {
                    orderStatus = 'challenge';
                    paymentStatus = 'pending';
                    console.log('🟡 Payment challenged by fraud detection');
                } else if (fraudStatus === 'accept') {
                    orderStatus = 'completed';
                    paymentStatus = 'paid';
                    console.log('🟢 Payment captured and accepted');
                }
                break;
                
            case 'settlement':
                orderStatus = 'completed';
                paymentStatus = 'paid';
                console.log('🟢 Payment settled');
                break;
                
            case 'pending':
                orderStatus = 'pending';
                paymentStatus = 'pending';
                console.log('🟡 Payment pending');
                break;
                
            case 'deny':
                orderStatus = 'cancelled';
                paymentStatus = 'denied';
                console.log('🔴 Payment denied');
                break;
                
            case 'expire':
                orderStatus = 'cancelled';
                paymentStatus = 'expired';
                console.log('🔴 Payment expired');
                break;
                
            case 'cancel':
                orderStatus = 'cancelled';
                paymentStatus = 'cancelled';
                console.log('🔴 Payment cancelled');
                break;
                
            default:
                console.log(`🟠 Unknown transaction status: ${transactionStatus}`);
        }
        
        // 4. Update order di database
        const updateConn = await pool.getConnection();
        try {
            const [updateResult] = await updateConn.query(
                `UPDATE orders SET 
                    status = ?,
                    payment_status = ?,
                    midtrans_transaction_id = ?,
                    payment_method = COALESCE(?, payment_method),
                    updated_at = NOW(),
                    notes = CONCAT(
                        COALESCE(notes, ''),
                        ' | Midtrans: ${transactionStatus} (${fraudStatus}) at ${new Date().toISOString()}'
                    )
                 WHERE order_number = ?`,
                [
                    orderStatus,
                    paymentStatus,
                    transactionId,
                    paymentType,
                    orderId
                ]
            );
            
            if (updateResult.affectedRows > 0) {
                console.log(`✅ Order ${orderId} updated: ${orderStatus}/${paymentStatus}`);
                
                // Log update ke payment_logs
                await updateConn.query(
                    `INSERT INTO payment_logs 
                     (order_number, payment_method, amount, status, transaction_id, response_data)
                     SELECT 
                        order_number,
                        payment_method,
                        total,
                        ?,
                        ?,
                        ?
                     FROM orders 
                     WHERE order_number = ?`,
                    [
                        `status_updated_${transactionStatus}`,
                        transactionId,
                        JSON.stringify({ 
                            previous_status: 'pending', 
                            new_status: transactionStatus,
                            updated_at: new Date().toISOString() 
                        }),
                        orderId
                    ]
                );
            } else {
                console.warn(`⚠️ Order ${orderId} not found in database`);
            }
            
        } catch (updateError) {
            console.error('❌ Error updating order:', updateError.message);
        } finally {
            updateConn.release();
        }
        
        console.log('✅ Webhook processed successfully');
        res.status(200).json({ 
            success: true, 
            message: 'Notification processed',
            order_id: orderId,
            status: transactionStatus
        });
        
    } catch (error) {
        console.error('❌ Webhook processing error:', {
            message: error.message,
            stack: error.stack
        });
        
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error processing webhook',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ===============================
// CHECK PAYMENT STATUS
// ===============================
exports.checkPaymentStatus = async (req, res) => {
    try {
        const { orderId } = req.params;
        
        if (!orderId) {
            return res.status(400).json({
                success: false,
                message: 'Order ID diperlukan'
            });
        }
        
        console.log('🔍 Checking payment status for:', orderId);
        
        // 1. Cek di database dulu
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
        const response = {
            success: true,
            order_id: orderData.order_number,
            customer_name: orderData.customer_name,
            total_amount: orderData.total,
            payment_method: orderData.payment_method,
            status: orderData.status,
            payment_status: orderData.payment_status,
            created_at: orderData.created_at,
            updated_at: orderData.updated_at
        };
        
        // 2. Jika COD, langsung return
        if (orderData.payment_method === 'COD') {
            return res.json(response);
        }
        
        // 3. Cek status dari Midtrans
        try {
            const midtransStatus = await coreApi.transaction.status(orderId);
            
            response.midtrans_status = {
                transaction_status: midtransStatus.transaction_status,
                fraud_status: midtransStatus.fraud_status,
                payment_type: midtransStatus.payment_type,
                gross_amount: midtransStatus.gross_amount,
                transaction_time: midtransStatus.transaction_time,
                expiry_time: midtransStatus.expiry_time
            };
            
            console.log('✅ Midtrans status retrieved for:', orderId);
            
        } catch (midtransError) {
            console.warn('⚠️ Could not fetch Midtrans status:', midtransError.message);
            response.midtrans_status = {
                error: 'Could not fetch status from Midtrans',
                note: 'Using database status'
            };
        }
        
        res.json(response);
        
    } catch (error) {
        console.error('❌ Check payment error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Gagal mengecek status pembayaran',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ===============================
// GET ALL ORDERS (ADMIN)
// ===============================
exports.getAllOrders = async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 20, 
            status, 
            payment_method,
            start_date,
            end_date 
        } = req.query;
        
        const offset = (parseInt(page) - 1) * parseInt(limit);
        
        // Build query conditions
        let conditions = [];
        let params = [];
        
        if (status) {
            conditions.push('o.status = ?');
            params.push(status);
        }
        
        if (payment_method) {
            conditions.push('o.payment_method = ?');
            params.push(payment_method);
        }
        
        if (start_date) {
            conditions.push('DATE(o.created_at) >= ?');
            params.push(start_date);
        }
        
        if (end_date) {
            conditions.push('DATE(o.created_at) <= ?');
            params.push(end_date);
        }
        
        const whereClause = conditions.length > 0 
            ? 'WHERE ' + conditions.join(' AND ')
            : '';
        
        // Get total count
        const [countResult] = await pool.query(
            `SELECT COUNT(*) as total FROM orders o ${whereClause}`,
            params
        );
        
        const total = countResult[0].total;
        
        // Get orders with pagination
        params.push(parseInt(limit), offset);
        
        const [orders] = await pool.query(`
            SELECT 
                o.*, 
                COUNT(oi.id) as item_count,
                SUM(oi.quantity) as total_items,
                SUM(oi.price * oi.quantity) as subtotal,
                GROUP_CONCAT(DISTINCT oi.name SEPARATOR ', ') as items
            FROM orders o
            LEFT JOIN order_items oi ON o.id = oi.order_id
            ${whereClause}
            GROUP BY o.id
            ORDER BY o.created_at DESC
            LIMIT ? OFFSET ?
        `, params);
        
        res.json({ 
            success: true, 
            data: orders,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
        
    } catch (err) {
        console.error('❌ Error fetching orders:', err);
        res.status(500).json({ 
            success: false, 
            message: 'Gagal mengambil data order',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
};

// ===============================
// GET ORDER DETAILS
// ===============================
exports.getOrderDetails = async (req, res) => {
    const { id } = req.params;
    
    try {
        // Cek berdasarkan ID atau order_number
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
            `SELECT 
                oi.*, 
                p.name as product_name, 
                p.image,
                p.description,
                (oi.price * oi.quantity) as subtotal
             FROM order_items oi
             LEFT JOIN products p ON oi.product_id = p.id
             WHERE oi.order_id = ?
             ORDER BY oi.created_at`,
            [order[0].id]
        );
        
        // Get payment logs for this order
        const [paymentLogs] = await pool.query(
            `SELECT * FROM payment_logs 
             WHERE order_number = ? 
             ORDER BY created_at DESC`,
            [order[0].order_number]
        );
        
        res.json({ 
            success: true, 
            order: order[0],
            items,
            payment_logs: paymentLogs,
            summary: {
                total_items: items.reduce((sum, item) => sum + item.quantity, 0),
                subtotal: items.reduce((sum, item) => sum + (item.price * item.quantity), 0),
                item_count: items.length
            }
        });
        
    } catch (err) {
        console.error('❌ Error fetching order details:', err);
        res.status(500).json({ 
            success: false, 
            message: 'Gagal mengambil detail order',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
};

// ===============================
// UPDATE ORDER STATUS (ADMIN)
// ===============================
exports.updateOrderStatus = async (req, res) => {
    const { id } = req.params;
    const { status, notes } = req.body;
    
    const validStatuses = ['pending', 'confirmed', 'processing', 'completed', 'cancelled'];
    
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ 
            success: false, 
            message: 'Status tidak valid. Pilihan: ' + validStatuses.join(', ') 
        });
    }
    
    try {
        const [result] = await pool.query(
            `UPDATE orders 
             SET status = ?, 
                 notes = CONCAT(COALESCE(notes, ''), ' | Admin update: ${status} at ${new Date().toISOString()}'),
                 updated_at = NOW() 
             WHERE id = ?`,
            [status, id]
        );
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Order tidak ditemukan' 
            });
        }
        
        // Log the update
        await pool.query(
            `INSERT INTO payment_logs 
             (order_id, order_number, status, response_data)
             SELECT 
                id,
                order_number,
                ?,
                ?
             FROM orders 
             WHERE id = ?`,
            [
                `admin_updated_${status}`,
                JSON.stringify({ 
                    updated_by: req.session?.user?.id || 'system',
                    previous_status: 'unknown', // Note: kita tidak tahu previous status
                    new_status: status,
                    notes: notes || '',
                    timestamp: new Date().toISOString()
                }),
                id
            ]
        );
        
        res.json({ 
            success: true, 
            message: `Status order berhasil diupdate ke ${status}`,
            order_id: id,
            new_status: status
        });
        
    } catch (err) {
        console.error('❌ Error updating order status:', err);
        res.status(500).json({ 
            success: false, 
            message: 'Gagal update status order',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
};

// ===============================
// HELPER FUNCTIONS
// ===============================

/**
 * Get enabled payments for Midtrans
 * Sesuai: https://docs.midtrans.com/docs/snap-snap-integration-guide#section-supported-payment-features
 */
function getEnabledPayments(paymentType) {
    const paymentMethods = {
        'credit_card': ['credit_card'],
        'gopay': ['gopay'],
        'shopeepay': ['shopeepay'],
        'qris': ['qris'], // QRIS langsung didukung
        'bank_transfer': ['bank_transfer'],
        // Convenience stores
        'cstore': ['cstore'],
        // E-Channel (Mandiri Bill)
        'echannel': ['echannel'],
        // All (default)
        'all': [
            'credit_card', 
            'gopay', 
            'shopeepay', 
            'qris', 
            'bank_transfer',
            'cstore',
            'echannel'
        ]
    };
    
    return paymentMethods[paymentType] || paymentMethods['all'];
}

/**
 * Log payment to database
 */
async function logPayment(orderId, orderNumber, paymentMethod, amount, status, transactionId, response) {
    try {
        const connection = await pool.getConnection();
        
        await connection.query(
            `INSERT INTO payment_logs 
             (order_id, order_number, payment_method, amount, status, transaction_id, response_data)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                orderId,
                orderNumber,
                paymentMethod,
                amount,
                status,
                transactionId,
                JSON.stringify(response)
            ]
        );
        
        connection.release();
        
        console.log('📝 Payment logged:', { orderNumber, status, paymentMethod });
        
    } catch (error) {
        console.error('❌ Error logging payment:', error.message);
        // Don't throw, just log the error
    }
}

/**
 * Get payment display name
 */
function getPaymentName(paymentMethod) {
    const names = {
        'COD': 'Cash On Delivery',
        'credit_card': 'Kartu Kredit/Debit',
        'gopay': 'GoPay',
        'shopeepay': 'ShopeePay',
        'qris': 'QRIS',
        'bank_transfer': 'Transfer Bank',
        'cstore': 'Convenience Store',
        'echannel': 'Mandiri Bill'
    };
    
    return names[paymentMethod] || paymentMethod;
}

/**
 * Validate order data
 */
function validateOrderData(data) {
    const errors = [];
    
    if (!data.name || data.name.trim().length < 2) {
        errors.push('Nama harus diisi (minimal 2 karakter)');
    }
    
    if (!data.phone || !/^08[0-9]{8,13}$/.test(data.phone)) {
        errors.push('Nomor telepon tidak valid. Format: 08xxxxxxxxxx');
    }
    
    if (!data.address || data.address.trim().length < 10) {
        errors.push('Alamat harus diisi (minimal 10 karakter)');
    }
    
    if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
        errors.push('Keranjang belanja kosong');
    } else {
        data.items.forEach((item, index) => {
            if (!item.product_id) {
                errors.push(`Item ${index + 1}: Product ID tidak valid`);
            }
            if (!item.quantity || item.quantity < 1) {
                errors.push(`Item ${index + 1}: Jumlah harus minimal 1`);
            }
            if (!item.price || item.price < 100) {
                errors.push(`Item ${index + 1}: Harga tidak valid`);
            }
        });
    }
    
    if (!data.total || data.total < 1000) {
        errors.push('Total pembelian minimum Rp 1.000');
    }
    
    return errors;
}

module.exports = exports;