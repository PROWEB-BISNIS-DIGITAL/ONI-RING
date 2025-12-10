// config/midtrans.js
const midtransClient = require('midtrans-client');
require('dotenv').config();

console.log('🔧 Midtrans Config Loading...');
console.log('Server Key:', process.env.MIDTRANS_SERVER_KEY ? '✅ Set' : '❌ Not set');
console.log('Client Key:', process.env.MIDTRANS_CLIENT_KEY ? '✅ Set' : '❌ Not set');
console.log('Environment:', process.env.NODE_ENV || 'development');

// Gunakan sandbox untuk development
const isProduction = process.env.NODE_ENV === 'production' || false;

// Initialize Snap
const snap = new midtransClient.Snap({
    isProduction: isProduction,
    serverKey: process.env.MIDTRANS_SERVER_KEY,
    clientKey: process.env.MIDTRANS_CLIENT_KEY
});

// Initialize Core API
const coreApi = new midtransClient.CoreApi({
    isProduction: isProduction,
    serverKey: process.env.MIDTRANS_SERVER_KEY,
    clientKey: process.env.MIDTRANS_CLIENT_KEY
});

// Test connection
const testMidtransConnection = async () => {
    try {
        const testParam = {
            transaction_details: {
                order_id: `TEST-${Date.now()}`,
                gross_amount: 10000
            },
            customer_details: {
                first_name: 'Test',
                email: 'test@example.com',
                phone: '081234567890'
            }
        };
        
        const result = await snap.createTransaction(testParam);
        console.log('✅ Midtrans Connection Test SUCCESS');
        console.log('Token:', result.token?.substring(0, 30) + '...');
        console.log('Redirect URL:', result.redirect_url);
        
        return true;
    } catch (error) {
        console.error('❌ Midtrans Connection Test FAILED:', error.message);
        console.error('Full Error:', error);
        
        if (error.ApiResponse) {
            console.error('API Response:', JSON.stringify(error.ApiResponse, null, 2));
        }
        
        return false;
    }
};

// Test saat startup
if (process.env.NODE_ENV !== 'test') {
    setTimeout(() => {
        testMidtransConnection();
    }, 1000);
}

module.exports = {
    snap,
    coreApi,
    testMidtransConnection,
    
    // Helper functions
    createTransaction: async (parameter) => {
        try {
            console.log('📦 Creating Midtrans transaction...');
            console.log('Order ID:', parameter.transaction_details.order_id);
            console.log('Amount:', parameter.transaction_details.gross_amount);
            
            const transaction = await snap.createTransaction(parameter);
            
            console.log('✅ Transaction created successfully');
            console.log('Token:', transaction.token);
            console.log('Redirect URL:', transaction.redirect_url);
            
            return transaction;
        } catch (error) {
            console.error('❌ Failed to create transaction:', error.message);
            console.error('Error Details:', {
                code: error.ApiResponse?.status_code,
                message: error.ApiResponse?.status_message,
                validation_messages: error.ApiResponse?.validation_messages
            });
            
            throw error;
        }
    }
};