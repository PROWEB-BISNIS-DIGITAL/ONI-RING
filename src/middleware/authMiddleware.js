// Middleware untuk mengecek apakah user sudah login
exports.isAuthenticated = (req, res, next) => {
    if (req.session && req.session.user) {
        return next();
    }
    res.redirect('/login');
};

// Middleware untuk mengecek role admin
exports.isAdmin = (req, res, next) => {
    if (req.session && req.session.user && req.session.user.role === 'admin') {
        return next();
    }
    res.redirect('/login');
};

// Middleware untuk mengecek role user biasa
exports.isUser = (req, res, next) => {
    if (req.session && req.session.user && req.session.user.role === 'user') {
        return next();
    }
    res.redirect('/login');
};

// Middleware untuk menyimpan user data ke res.locals
exports.userToLocals = (req, res, next) => {
    if (req.session && req.session.user) {
        res.locals.user = req.session.user;
    }
    next();
};