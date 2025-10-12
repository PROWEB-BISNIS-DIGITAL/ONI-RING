const express = require('express');

const logger = (req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
};

const authenticate = (req, res, next) => {
    // Authentication logic here
    next();
};

module.exports = {
    logger,
    authenticate
};