
const midtransClient = require('midtrans-client');

// Initialize Snap API client
let snap = new midtransClient.Snap({
    // Set to true if you want Production Environment (accept real transaction).
    isProduction: false,
    // Set server key from config
    serverKey: process.env.MIDTRANS_SERVER_KEY || 'Mid-server-8XqjcidADGvvU4jHxvTubdXJ',
    // Optional: Set client key for frontend
    clientKey: process.env.MIDTRANS_CLIENT_KEY || 'Mid-client-wu4jZk-6I4uaNjsF'
});

// Initialize Core API (for backend operations)
let core = new midtransClient.CoreApi({
    isProduction: false,
    serverKey: process.env.MIDTRANS_SERVER_KEY || 'Mid-server-8XqjcidADGvvU4jHxvTubdXJ',
    clientKey: process.env.MIDTRANS_CLIENT_KEY || 'Mid-client-wu4jZk-6I4uaNjsF'
});

module.exports = {
    snap,
    core,
    // For convenience
    createSnapTransaction: async (parameter) => {
        return await snap.createTransaction(parameter);
    },
    createTransactionToken: async (parameter) => {
        const transaction = await snap.createTransaction(parameter);
        return transaction.token;
    }
};